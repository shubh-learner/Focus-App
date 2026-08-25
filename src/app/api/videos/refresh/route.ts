import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getLatestUploads, uploadsPlaylistIdFromChannelId } from "@/lib/youtube";

// Called on a schedule (see .github/workflows/refresh-videos.yml) — NOT by
// end users. Protected by a shared secret so random requests can't burn quota.
//
// Cost: 1 YouTube API unit per DISTINCT subscribed channel (playlistItems.list).
// With ~50 users and generously ~150 distinct channels between them, one full
// refresh costs ~150 units. Running this every 3 hours (8x/day) costs
// ~1,200 units/day — well under the 10,000/day free quota, leaving headroom
// for channel searches (100 units each) and new-channel onboarding.
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();

  // Only refresh channels that at least one user is actually subscribed to.
  const { data: subs, error: subsErr } = await supabase
    .from("subscriptions")
    .select("channel_id");
  if (subsErr) return NextResponse.json({ error: subsErr.message }, { status: 500 });

  const channelIds = Array.from(new Set((subs ?? []).map((s) => s.channel_id)));
  if (channelIds.length === 0) {
    return NextResponse.json({ ok: true, refreshed: 0 });
  }

  const { data: channels, error: chErr } = await supabase
    .from("channels")
    .select("channel_id, uploads_playlist_id")
    .in("channel_id", channelIds);
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 });

  let refreshed = 0;
  const errors: { channelId: string; message: string }[] = [];

  for (const channel of channels ?? []) {
    const playlistId =
      channel.uploads_playlist_id ?? uploadsPlaylistIdFromChannelId(channel.channel_id);
    if (!playlistId) continue;

    try {
      const uploads = await getLatestUploads(playlistId, 6);
      if (uploads.length) {
        await supabase.from("videos").upsert(
          uploads.map((v) => ({
            channel_id: channel.channel_id,
            video_id: v.videoId,
            title: v.title,
            thumbnail_url: v.thumbnailUrl,
            published_at: v.publishedAt,
          })),
          { onConflict: "channel_id,video_id" }
        );
      }
      await supabase
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

  return NextResponse.json({ ok: true, refreshed, total: channels?.length ?? 0, errors });
}
