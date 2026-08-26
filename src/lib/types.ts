export type Section = {
  id: string;
  user_id: string;
  name: string;
  position: number;
  created_at: string;
};

export type Channel = {
  channel_id: string;
  title: string;
  thumbnail_url: string | null;
  uploads_playlist_id: string | null;
  last_fetched_at: string | null;
};

export type Subscription = {
  id: string;
  user_id: string;
  section_id: string;
  channel_id: string;
  created_at: string;
};

export type Video = {
  id: string;
  channel_id: string;
  video_id: string;
  title: string;
  thumbnail_url: string | null;
  published_at: string;
  duration_seconds: number | null; 
};

// Shape returned by GET /api/videos — a section, its subscribed channels,
// and each channel's latest cached videos, ready for the dashboard UI.
export type SectionFeed = {
  section: Section;
  channels: {
    channel: Channel;
    videos: Video[];
  }[];
};
