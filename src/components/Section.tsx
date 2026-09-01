"use client";

import { useState } from "react";
import Image from "next/image";
import type { SectionFeed, Video } from "@/lib/types";
import VideoCard from "./VideoCard";
import KeywordModal from "./KeywordModal";
import { useMemo } from "react";

export default function Section({
  data,
  colorful,
  order,
  onDelete,
  onAddChannels,
  onKeywordsChanged,
  onPlay,
}: {
  data: SectionFeed;
  colorful: boolean;
  order: "time" | "random";
  onDelete: () => void;
  onAddChannels: () => void;
  onKeywordsChanged: () => void;
  onPlay: (video: Video) => void;
}) {
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);

  const videos = useMemo(() => {
    const flat = data.channels.flatMap((c) => c.videos.map((v) => ({ video: v, channel: c.channel })));

    if (order === "random") {
      const shuffled = [...flat];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    return flat.sort(
      (a, b) => new Date(b.video.published_at).getTime() - new Date(a.video.published_at).getTime()
    );
  }, [data, order]);

  const editingChannel = data.channels.find((c) => c.channel.channel_id === editingChannelId);

  async function saveKeywords(channelId: string, keywords: string[]) {
    await fetch("/api/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId: data.section.id, channelId, keywords }),
    });
    setEditingChannelId(null);
    onKeywordsChanged();
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {data.channels.map((c) => (
            <button
              key={c.channel.channel_id}
              onClick={() => setEditingChannelId(c.channel.channel_id)}
              className={`relative h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 transition hover:opacity-80 ${
                c.keywords.length ? "border-accent" : "border-line"
              } ${colorful ? "" : "grayscale hover:grayscale-0"}`}
              title={
                c.keywords.length
                  ? `${c.channel.title} — filtering: ${c.keywords.join(", ")}`
                  : `${c.channel.title} — click to filter by keyword`
              }
            >
              {c.channel.thumbnail_url && (
                <Image
                  src={c.channel.thumbnail_url}
                  alt={c.channel.title}
                  fill
                  className="object-cover"
                />
              )}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1 text-xs text-muted">
          <button onClick={onAddChannels} className="rounded px-2 py-1 hover:bg-line/60">
            +- Channel
          </button>
          <button
            onClick={onDelete}
            className="rounded px-2 py-1 hover:bg-line/60 hover:text-red-700"
          >
            Delete section
          </button>
        </div>
      </div>

      {data.channels.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
          No channels yet.{" "}
          <button onClick={onAddChannels} className="text-accent underline underline-offset-4">
            Subscribe to a channel
          </button>{" "}
          to see its latest videos here.
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
          No videos currently match your keyword filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {videos.map(({ video, channel }) => (
            <VideoCard
              key={video.id}
              video={video}
              channel={channel}
              colorful={colorful}
              onPlay={onPlay}
            />
          ))}
        </div>
      )}

      {editingChannel && (
        <KeywordModal
          channelTitle={editingChannel.channel.title}
          initialKeywords={editingChannel.keywords}
          onSave={(keywords) => saveKeywords(editingChannel.channel.channel_id, keywords)}
          onClose={() => setEditingChannelId(null)}
        />
      )}
    </section>
  );
}