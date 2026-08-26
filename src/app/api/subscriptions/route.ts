import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server"
import { getChannelDetails, getLatestUploads, getVideoDurations } from "@/lib/youtube";

// Subscribe: body = { sectionId, channelId, channelTitle, channelThumbnail }
// If this is the first time ANYONE has subscribed to this channel, we resolve
// and cache its details (1 unit) and fetch its first batch of videos (1 unit).
// If the channel is already cached, this costs 0 YouTube API units.
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase();
  const admin = createAdminSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId, channelId, channelTitle, channelThumbnail } = await request.json();
  if (!sectionId || !channelId) {
    return NextResponse.json({ error: "sectionId and channelId are required" }, { status: 400 });
  }

  // Ensure the channel exists in the shared cache.
  const { data: existing } = await supabase
    .from("channels")
    .select("channel_id")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (!existing) {
    try {
      const details = await getChannelDetails(channelId);
      const { error: insertErr } = await admin.from("channels").insert({
        channel_id: details.channelId,
        title: details.title,
        thumbnail_url: details.thumbnailUrl,
        uploads_playlist_id: details.uploadsPlaylistId,
      });
      if (insertErr) throw insertErr;

      const uploads = await getLatestUploads(details.uploadsPlaylistId);
      if (uploads.length) {
        const durations = await getVideoDurations(uploads.map((v) => v.videoId));
        await admin.from("videos").upsert(
          uploads.map((v) => ({
            channel_id: details.channelId,
            video_id: v.videoId,
            title: v.title,
            thumbnail_url: v.thumbnailUrl,
            published_at: v.publishedAt,
            duration_seconds: durations.get(v.videoId) ?? null,
          })),
          { onConflict: "channel_id,video_id" }
        );
      }

      await admin
        .from("channels")
        .update({ last_fetched_at: new Date().toISOString() })
        .eq("channel_id", channelId);
    } catch (err: any) {
      // Fall back to lightweight metadata from the search result so the
      // subscribe action still succeeds even if a details call fails;
      // the next scheduled refresh will backfill videos.
      await admin.from("channels").upsert({
        channel_id: channelId,
        title: channelTitle ?? channelId,
        thumbnail_url: channelThumbnail ?? null,
      });
    }
  }

  const { data, error } = await admin
    .from("subscriptions")
    .insert({ user_id: user.id, section_id: sectionId, channel_id: channelId })
    .select()
    .single();

  if (error) {
    // Unique constraint = already subscribed; treat as success (idempotent)
    if (error.code === "23505") return NextResponse.json({ ok: true, already: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subscription: data }, { status: 201 });
}

// Unsubscribe: body = { sectionId, channelId }
export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId, channelId } = await request.json();
  if (!sectionId || !channelId) {
    return NextResponse.json({ error: "sectionId and channelId are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("section_id", sectionId)
    .eq("channel_id", channelId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
