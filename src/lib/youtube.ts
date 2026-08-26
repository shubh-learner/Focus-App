// Thin wrapper around the free YouTube Data API v3.
//
// QUOTA NOTES (default free quota = 10,000 units/day):
//   - search.list            costs 100 units/call  -> used ONLY for channel search
//   - channels.list           costs   1 unit/call   -> used to resolve a channel's
//                                                       "uploads" playlist once
//   - playlistItems.list      costs   1 unit/call   -> used for every video refresh
//                                                       (cheap! this is the key trick)
//
// We deliberately avoid calling search.list to list a channel's videos
// (100 units) and instead read its uploads playlist (1 unit), which is
// >100x cheaper and lets ~50 users comfortably refresh many channels
// several times a day. See README "Quota management" for the full math.

const API_BASE = "https://www.googleapis.com/youtube/v3";

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not set");
  return key;
}

export type ChannelSearchResult = {
  channelId: string;
  title: string;
  thumbnailUrl: string;
  description: string;
};

// Costs 100 units. Only called when the user actively searches for a channel.
export async function searchChannels(query: string): Promise<ChannelSearchResult[]> {
  const url = new URL(`${API_BASE}/search`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "channel");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "8");
  url.searchParams.set("key", apiKey());

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube search failed: ${res.status} ${body}`);
  }
  const data = await res.json();

  return (data.items ?? []).map((item: any) => ({
    channelId: item.snippet.channelId ?? item.id.channelId,
    title: item.snippet.title,
    thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
    description: item.snippet.description,
  }));
}

export type ChannelDetails = {
  channelId: string;
  title: string;
  thumbnailUrl: string;
  uploadsPlaylistId: string;
};

// Costs 1 unit. Called once per new channel (result is cached in `channels` table).
export async function getChannelDetails(channelId: string): Promise<ChannelDetails> {
  const url = new URL(`${API_BASE}/channels`);
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("id", channelId);
  url.searchParams.set("key", apiKey());

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube channels.list failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) throw new Error("Channel not found");

  return {
    channelId: item.id,
    title: item.snippet.title,
    thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
  };
}

export type PlaylistVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
};

// Costs 1 unit per call, returns up to `maxResults` latest uploads.
// This is the cheap path used by the refresh cron for every subscribed channel.
export async function getLatestUploads(
  uploadsPlaylistId: string,
  maxResults = 6
): Promise<PlaylistVideo[]> {
  const url = new URL(`${API_BASE}/playlistItems`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("playlistId", uploadsPlaylistId);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", apiKey());

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube playlistItems.list failed: ${res.status} ${body}`);
  }
  const data = await res.json();

  return (data.items ?? [])
    .filter((item: any) => item.snippet?.resourceId?.videoId)
    .map((item: any) => ({
      videoId: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      thumbnailUrl:
        item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
      publishedAt: item.snippet.publishedAt,
    }));
}

// Costs 1 unit per call regardless of batch size (up to 50 video IDs).
// Called with ALL video IDs from a refresh/subscribe batch at once —
// never per-video — to keep quota cost minimal.
export async function getVideoDurations(videoIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (videoIds.length === 0) return result;

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = new URL(`${API_BASE}/videos`);
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", apiKey());

    const res = await fetch(url.toString());
    if (!res.ok) continue; // don't fail the whole refresh over a duration lookup
    const data = await res.json();
    for (const item of data.items ?? []) {
      result.set(item.id, parseIsoDuration(item.contentDetails.duration));
    }
  }
  return result;
}

// Parses ISO 8601 durations like "PT1H2M3S" into total seconds.
function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// Converts a "UC..." channel ID into its "UU..." uploads playlist ID without
// any API call. This shortcut works for the vast majority of channels and is
// used as a fast fallback; getChannelDetails() remains the authoritative path
// used once per channel to store the real value.
export function uploadsPlaylistIdFromChannelId(channelId: string): string | null {
  if (channelId.startsWith("UC")) return "UU" + channelId.slice(2);
  return null;
}
