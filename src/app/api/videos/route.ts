import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { SectionFeed } from "@/lib/types";

// Reads purely from the Supabase cache — costs 0 YouTube API units.
export async function GET() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sections, error: sectionsErr } = await supabase
    .from("sections")
    .select("*")
    .order("position", { ascending: true });
  if (sectionsErr) return NextResponse.json({ error: sectionsErr.message }, { status: 500 });

  const { data: subs, error: subsErr } = await supabase
    .from("subscriptions")
    .select("section_id, channel_id, keywords");
  if (subsErr) return NextResponse.json({ error: subsErr.message }, { status: 500 });

  const channelIds = Array.from(new Set((subs ?? []).map((s) => s.channel_id)));

  const [{ data: channels }, { data: videos }] = await Promise.all([
    channelIds.length
      ? supabase.from("channels").select("*").in("channel_id", channelIds)
      : Promise.resolve({ data: [] as any[] }),
    channelIds.length
      ? supabase
          .from("videos")
          .select("*")
          .in("channel_id", channelIds)
          .order("published_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const channelById = new Map((channels ?? []).map((c) => [c.channel_id, c]));
  const videosByChannel = new Map<string, any[]>();
  for (const v of videos ?? []) {
    const list = videosByChannel.get(v.channel_id) ?? [];
    if (list.length < 8) list.push(v); // cap per channel for a calm feed
    videosByChannel.set(v.channel_id, list);
  }

  const feed: SectionFeed[] = (sections ?? []).map((section) => {
    const subsForSection = (subs ?? []).filter((s) => s.section_id === section.id);

    return {
      section,
      channels: subsForSection
        .map((sub) => {
          const channel = channelById.get(sub.channel_id);
          if (!channel) return null;

          const allVideos = videosByChannel.get(sub.channel_id) ?? [];
          const keywords = ((sub.keywords ?? []) as string[])
            .map((k) => k.trim())
            .filter(Boolean);

          // OR matching across keywords, case-insensitive, title only.
          // Empty keywords = unchanged existing behavior (show everything).
          const videosForChannel = keywords.length
            ? allVideos.filter((v) =>
                keywords.some((k) => v.title.toLowerCase().includes(k.toLowerCase()))
              )
            : allVideos;

          return { channel, videos: videosForChannel, keywords };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null),
    };
  });

  return NextResponse.json({ feed });
}