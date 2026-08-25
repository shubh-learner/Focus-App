import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { SectionFeed } from "@/lib/types";

// Reads purely from the Supabase cache — costs 0 YouTube API units.
// This is the route the dashboard calls on every load.
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
    .select("section_id, channel_id");
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
    const channelIdsForSection = (subs ?? [])
      .filter((s) => s.section_id === section.id)
      .map((s) => s.channel_id);

    return {
      section,
      channels: channelIdsForSection
        .map((cid) => channelById.get(cid))
        .filter(Boolean)
        .map((channel) => ({
          channel,
          videos: videosByChannel.get(channel.channel_id) ?? [],
        })),
    };
  });

  return NextResponse.json({ feed });
}
