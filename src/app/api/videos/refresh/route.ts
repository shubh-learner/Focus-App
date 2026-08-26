import { NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getLatestUploads, uploadsPlaylistIdFromChannelId, getVideoDurations, type PlaylistVideo } from "@/lib/youtube";

const REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

async function getLastRefresh(admin: ReturnType<typeof createAdminSupabase>) {
  const { data } = await admin
    .from("system_state")
    .select("last_refresh_at")
    .eq("id", 1)
    .maybeSingle();
  return data?.last_refresh_at ? new Date(data.last_refresh_at) : null;
}

// GET: lets the button know its current state on page load, without triggering a refresh.
export async function GET() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminSupabase();
  const lastRefreshAt = await getLastRefresh(admin);
  const nextAllowedAt = lastRefreshAt
    ? new Date(lastRefreshAt.getTime() + REFRESH_COOLDOWN_MS)
    : null;
  const canRefresh = !nextAllowedAt || nextAllowedAt.getTime() <= Date.now();

  return NextResponse.json({
    nextAllowedAt: canRefresh ? null : nextAllowedAt!.toISOString(),
  });
}

// POST: any signed-in user can trigger this, but it's globally rate-limited
// to once per hour since the video cache is shared, not per-user.
export async function POST() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminSupabase();
  const lastRefreshAt = await getLastRefresh(admin);

  if (lastRefreshAt) {
    const nextAllowedAt = new Date(lastRefreshAt.getTime() + REFRESH_COOLDOWN_MS);
    if (nextAllowedAt.getTime() > Date.now()) {
      return NextResponse.json(
        { error: "Refreshed recently", nextAllowedAt: nextAllowedAt.toISOString() },
        { status: 429 }
      );
    }
  }

  // Claim the slot immediately so two people clicking at nearly the same
  // moment don't both kick off a full refresh.
  await admin.from("system_state").upsert({ id: 1, last_refresh_at: new Date().toISOString() });

  const { data: subs } = await admin.from("subscriptions").select("channel_id");
  const channelIds = Array.from(new Set((subs ?? []).map((s) => s.channel_id)));

  let refreshed = 0;
  const errors: { channelId: string; message: string }[] = [];

  if (channelIds.length) {
    const { data: channels } = await admin
      .from("channels")
      .select("channel_id, uploads_playlist_id")
      .in("channel_id", channelIds);

    const perChannelUploads: { channelId: string; uploads: PlaylistVideo[] }[] = [];

    for (const channel of channels ?? []) {
      const playlistId =
        channel.uploads_playlist_id ?? uploadsPlaylistIdFromChannelId(channel.channel_id);
      if (!playlistId) continue;

      try {
        const uploads = await getLatestUploads(playlistId, 6);
        perChannelUploads.push({ channelId: channel.channel_id, uploads });
        await admin
          .from("channels")
          .update({
            last_fetched_at: new Date().toISOString(),
            ...(channel.uploads_playlist_id ? {} : { uploads_playlist_id: playlistId }),
          })
          .eq("channel_id", channel.channel_id);
        refreshed++;
      } catch (err: any) {
        errors.push({ channelId: channel.channel_id, message: err.message });
      }
    }

    // One batched call for every video found across every channel this refresh.
    const allVideoIds = perChannelUploads.flatMap((c) => c.uploads.map((u) => u.videoId));
    const durations = await getVideoDurations(allVideoIds);

    for (const { channelId, uploads } of perChannelUploads) {
      if (!uploads.length) continue;
      await admin.from("videos").upsert(
        uploads.map((v) => ({
          channel_id: channelId,
          video_id: v.videoId,
          title: v.title,
          thumbnail_url: v.thumbnailUrl,
          published_at: v.publishedAt,
          duration_seconds: durations.get(v.videoId) ?? null,
        })),
        { onConflict: "channel_id,video_id" }
      );
    }
  }

  const nextAllowedAt = new Date(Date.now() + REFRESH_COOLDOWN_MS).toISOString();
  return NextResponse.json({ ok: true, refreshed, total: channelIds.length, errors, nextAllowedAt });
}