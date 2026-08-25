"use client";

import type { SectionFeed, Video } from "@/lib/types";
import VideoCard from "./VideoCard";

export default function Section({
  data,
  onDelete,
  onAddChannels,
  onPlay,
}: {
  data: SectionFeed;
  onDelete: () => void;
  onAddChannels: () => void;
  onPlay: (video: Video) => void;
}) {
  const videos = data.channels.flatMap((c) =>
    c.videos.map((v) => ({ video: v, channel: c.channel }))
  );

  return (
    <section>
      <div className="mb-4 flex items-center justify-end gap-1 text-xs text-muted">
        <button onClick={onAddChannels} className="rounded px-2 py-1 hover:bg-line/60">
          + Channel
        </button>
        <button
          onClick={onDelete}
          className="rounded px-2 py-1 hover:bg-line/60 hover:text-red-700"
        >
          Delete section
        </button>
      </div>

      {videos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
          No channels yet.{" "}
          <button onClick={onAddChannels} className="text-accent underline underline-offset-4">
            Subscribe to a channel
          </button>{" "}
          to see its latest videos here.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {videos.map(({ video, channel }) => (
            <VideoCard key={video.id} video={video} channel={channel} onPlay={onPlay} />
          ))}
        </div>
      )}
    </section>
  );
}