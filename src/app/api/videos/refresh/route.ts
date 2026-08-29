import { NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getLatestUploads, uploadsPlaylistIdFromChannelId, getVideoDurations } from "@/lib/youtube";

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour, per channel

type ChannelRow = {
  channel_id: string;
  last_fetched_at: string | null;
  uploads_playlist_id: string | null;
};

// Given this user's subscribed channels, when can they usefully click refresh
// again? null = right now (at least one channel is stale). Otherwise: the
// moment the earliest-refreshed of their channels turns stale.
function computeNextAllowed(channels: ChannelRow[]): string | null {
  if (channels.length === 0) return null;
  const now = Date.now();
  const isStale = (c: ChannelRow) =>
    !c.last_fetched_at || now - new Date(c.last_fetched_at).getTime() >= COOLDOWN_MS;

  if (channels.some(isStale)) return null;

  const earliest = Math.min(...channels.map((c) => new Date(c.last_fetched_at!).getTime()));
  return new Date(earliest + COOLDOWN_MS).toISOString();
}

async function getUsersChannels(supabase: ReturnType<typeof createServerSupabase>) {
  const { data: subs } = await supabase.from("subscriptions").select("channel_id");
  const channelIds = Array.from(new Set((subs ?? []).map((s) => s.channel_id)));
  if (channelIds.length === 0) return [];

  const { data: channels } = await supabase
    .from("channels")
    .select("channel_id, last_fetched_at, uploads_playlist_id")
    .in("channel_id", channelIds);

  return (channels ?? []) as ChannelRow[];
}

// GET: tells the button its current state without triggering a refresh.
export async function GET() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const channels = await getUsersChannels(supabase);
  return NextResponse.json({ nextAllowedAt: computeNextAllowed(channels) });
}

// POST: refreshes only the caller's stale channels (skips ones already fresh,
// whether fresh because this user refreshed recently or another user did).
export async function POST() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const channels = await getUsersChannels(supabase);
  const nextAllowedAt = computeNextAllowed(channels);

  if (nextAllowedAt !== null) {
    return NextResponse.json({ error: "Refreshed recently", nextAllowedAt }, { status: 429 });
  }

  const now = Date.now();
  const stale = channels.filter(
    (c) => !c.last_fetched_at || now - new Date(c.last_fetched_at).getTime() >= COOLDOWN_MS
  );

  const admin = createAdminSupabase();
  let refreshed = 0;
  const errors: { channelId: string; message: string }[] = [];
  const perChannelUploads: { channelId: string; uploads: Awaited<ReturnType<typeof getLatestUploads>> }[] = [];

  for (const channel of stale) {
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

  const updatedChannels = await getUsersChannels(supabase);
  return NextResponse.json({
    ok: true,
    refreshed,
    total: stale.length,
    errors,
    nextAllowedAt: computeNextAllowed(updatedChannels),
  });
}