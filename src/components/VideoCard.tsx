"use client";

import Image from "next/image";
import type { Video, Channel } from "@/lib/types";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function VideoCard({
  video,
  channel,
  onPlay,
}: {
  video: Video;
  channel: Channel;
  onPlay: (video: Video) => void;
}) {
  return (
    <button
      onClick={() => onPlay(video)}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-card text-left shadow-card transition hover:border-accent/60"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-line">
        {video.thumbnail_url && (
          <Image
            src={video.thumbnail_url}
            alt={video.title}
            fill
            sizes="(max-width: 768px) 100vw, 320px"
            className="object-cover grayscale transition duration-300 group-hover:scale-[1.02] group-hover:grayscale-0 group-active:grayscale-0"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm leading-snug text-ink">{video.title}</p>
        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted">
          <span className="truncate">{channel.title}</span>
          <span className="shrink-0">{timeAgo(video.published_at)}</span>
        </div>
      </div>
    </button>
  );
}
