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

// Converts a "UC..." channel ID into its "UU..." uploads playlist ID without
// any API call. This shortcut works for the vast majority of channels and is
// used as a fast fallback; getChannelDetails() remains the authoritative path
// used once per channel to store the real value.
export function uploadsPlaylistIdFromChannelId(channelId: string): string | null {
  if (channelId.startsWith("UC")) return "UU" + channelId.slice(2);
  return null;
}
