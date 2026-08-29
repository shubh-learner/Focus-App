import { NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getLatestUploads, uploadsPlaylistIdFromChannelId, getVideoDurations } from "@/lib/youtube";
import { getUserFeed } from "@/lib/feed";

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour, per channel

type ChannelRow = {
  channel_id: string;
  last_fetched_at: string | null;
  uploads_playlist_id: string | null;
};

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

export async function GET() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const channels = await getUsersChannels(supabase);
  return NextResponse.json({ nextAllowedAt: computeNextAllowed(channels) });
}

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

  // Fetch every stale channel's latest uploads IN PARALLEL — this is the
  // main fix for the multi-second refresh delay (was a sequential for-loop).
  const results = await Promise.allSettled(
    stale.map(async (channel) => {
      const playlistId = channel.uploads_playlist_id ?? uploadsPlaylistIdFromChannelId(channel.channel_id);
      if (!playlistId) return { channelId: channel.channel_id, uploads: [], playlistId: null as string | null, hadPlaylistId: false };
      const uploads = await getLatestUploads(playlistId, 6);
      return { channelId: channel.channel_id, uploads, playlistId, hadPlaylistId: !!channel.uploads_playlist_id };
    })
  );

  let refreshed = 0;
  const errors: { channelId: string; message: string }[] = [];
  const perChannelUploads: { channelId: string; uploads: Awaited<ReturnType<typeof getLatestUploads>> }[] = [];

  // Cache-updating writes also run in parallel.
  await Promise.all(
    results.map(async (result, i) => {
      const channel = stale[i];
      if (result.status === "rejected") {
        errors.push({ channelId: channel.channel_id, message: result.reason?.message ?? "Unknown error" });
        return;
      }
      const { uploads, playlistId, hadPlaylistId } = result.value;
      if (!playlistId) return;

      perChannelUploads.push({ channelId: channel.channel_id, uploads });
      await admin
        .from("channels")
        .update({
          last_fetched_at: new Date().toISOString(),
          ...(hadPlaylistId ? {} : { uploads_playlist_id: playlistId }),
        })
        .eq("channel_id", channel.channel_id);
      refreshed++;
    })
  );

  const allVideoIds = perChannelUploads.flatMap((c) => c.uploads.map((u) => u.videoId));
  const durations = await getVideoDurations(allVideoIds);

  await Promise.all(
    perChannelUploads
      .filter((c) => c.uploads.length)
      .map(({ channelId, uploads }) =>
        admin.from("videos").upsert(
          uploads.map((v) => ({
            channel_id: channelId,
            video_id: v.videoId,
            title: v.title,
            thumbnail_url: v.thumbnailUrl,
            published_at: v.publishedAt,
            duration_seconds: durations.get(v.videoId) ?? null,
          })),
          { onConflict: "channel_id,video_id" }
        )
      )
  );

  const updatedChannels = await getUsersChannels(supabase);
  const feed = await getUserFeed(supabase); // returned directly — no second round trip needed

  return NextResponse.json({
    ok: true,
    refreshed,
    total: stale.length,
    errors,
    nextAllowedAt: computeNextAllowed(updatedChannels),
    feed,
  });
}