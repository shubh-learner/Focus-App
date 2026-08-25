"use client";

import { useEffect, useRef } from "react";
import type { Video } from "@/lib/types";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

let apiLoadPromise: Promise<void> | null = null;

// Loads the official YouTube IFrame Player API script exactly once per page.
function loadYouTubeIframeAPI(): Promise<void> {
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });

  return apiLoadPromise;
}

export default function VideoModal({
  video,
  onClose,
}: {
  video: Video | null;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (!video) return;

    let cancelled = false;

    loadYouTubeIframeAPI().then(() => {
      if (cancelled || !containerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: video.video_id,
        playerVars: {
          autoplay: 0, // no autoplay — the person chooses when to press play
          rel: 0, // limit related videos shown at the end to the same channel
          modestbranding: 1,
          fs: 1,
        },
      });
    });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKeyDown);
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video]);

  if (!video) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-lg bg-card shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="line-clamp-1 pr-4 text-sm text-ink">{video.title}</p>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full px-2 py-1 text-sm text-muted hover:bg-paper hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="aspect-video w-full bg-black">
          <div ref={containerRef} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
