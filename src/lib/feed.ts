import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionFeed } from "@/lib/types";

// Reads purely from the Supabase cache — costs 0 YouTube API units.
// Shared by GET /api/videos and POST /api/videos/refresh so refresh can
// return the updated feed directly, instead of the browser making a
// second separate request right after.
export async function getUserFeed(supabase: SupabaseClient): Promise<SectionFeed[]> {
  const { data: sections } = await supabase
    .from("sections")
    .select("*")
    .order("position", { ascending: true });

  const { data: subs } = await supabase
    .from("subscriptions")
    .select("section_id, channel_id, keywords");

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
    if (list.length < 8) list.push(v);
    videosByChannel.set(v.channel_id, list);
  }

  return (sections ?? []).map((section) => {
    const subsForSection = (subs ?? []).filter((s) => s.section_id === section.id);

    return {
      section,
      channels: subsForSection
        .map((sub) => {
          const channel = channelById.get(sub.channel_id);
          if (!channel) return null;

          const allVideos = videosByChannel.get(sub.channel_id) ?? [];
          const keywords = ((sub.keywords ?? []) as string[]).map((k) => k.trim()).filter(Boolean);

          const videosForChannel = keywords.length
            ? allVideos.filter((v) => keywords.some((k) => v.title.toLowerCase().includes(k.toLowerCase())))
            : allVideos;

          return { channel, videos: videosForChannel, keywords };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null),
    };
  });
}