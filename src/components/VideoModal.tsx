"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Video, Channel } from "@/lib/types";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

let apiLoadPromise: Promise<void> | null = null;

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

type RecommendedItem = { video: Video; channel: Channel };

export default function VideoModal({
  video,
  recommendedVideos,
  fullscreenEnabled,
  onClose,
}: {
  video: Video | null;
  recommendedVideos: RecommendedItem[];
  fullscreenEnabled: boolean;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);

  const [currentVideo, setCurrentVideo] = useState<Video | null>(video);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartYRef = useRef<number | null>(null);

  // A new video was opened from the dashboard grid (not from the drawer) —
  // reset to a clean state.
  useEffect(() => {
    setCurrentVideo(video);
    setDrawerOpen(false);
    setDragY(0);
  }, [video]);

  // Create/replace the actual YouTube player whenever the displayed video
  // changes — whether that's from the grid or from picking a recommendation.
  useEffect(() => {
    if (!currentVideo) {
      playerRef.current?.destroy?.();
      playerRef.current = null;
      return;
    }

    let cancelled = false;

    loadYouTubeIframeAPI().then(() => {
      if (cancelled || !containerRef.current) return;
      playerRef.current?.destroy?.();
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: currentVideo.video_id,
        playerVars: {
          autoplay: 1, // the person already chose this video, so play immediately
          rel: 0, // limit related videos shown at the end to the same channel
          modestbranding: 1,
          fs: 1,
        },
        events: {
          onReady: () => {
            if (!fullscreenEnabled) return;
            const iframe = playerRef.current?.getIframe?.();
            iframe?.requestFullscreen?.().catch(() => {});
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVideo?.video_id, fullscreenEnabled]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!video || !currentVideo) return null;

  const recommendations = recommendedVideos.filter(
    (r) => r.video.video_id !== currentVideo.video_id
  );

  function selectVideo(v: Video) {
    setCurrentVideo(v);
    // stay open so the person can keep browsing "up next" if they want
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartYRef.current = e.touches[0].clientY;
    setDragging(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartYRef.current === null) return;
    const delta = touchStartYRef.current - e.touches[0].clientY; // positive = swiped up
    if (!drawerOpen) {
      setDragY(Math.max(0, Math.min(delta, 320)));
    } else {
      // drawer already open — allow swiping back down to close it
      setDragY(Math.max(0, Math.min(320 + delta, 320)));
    }
  }

  function handleTouchEnd() {
    setDragging(false);
    touchStartYRef.current = null;
    if (dragY > 90) {
      setDrawerOpen(true);
      setDragY(320);
    } else {
      setDrawerOpen(false);
      setDragY(0);
    }
  }

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
          <p className="line-clamp-1 pr-4 text-sm text-ink">{currentVideo.title}</p>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full px-2 py-1 text-sm text-muted hover:bg-paper hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div
          className="relative aspect-video w-full overflow-hidden bg-black"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div ref={containerRef} className="h-full w-full" />

          {!drawerOpen && recommendations.length > 0 && (
            <button
              onClick={() => {
                setDrawerOpen(true);
                setDragY(320);
              }}
              className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-0.5 text-white/80"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 15l-6-6-6 6" />
              </svg>
              <span className="text-[10px]">Swipe up for more</span>
            </button>
          )}

          <div
            className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-xl bg-card ${
              dragging ? "" : "transition-transform duration-300 ease-out"
            }`}
            style={{
              height: "70%",
              transform: dragging
                ? `translateY(calc(100% - ${dragY}px))`
                : drawerOpen
                ? "translateY(0)"
                : "translateY(100%)",
            }}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-2">
              <span className="text-xs text-muted">Up next from your subscriptions</span>
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  setDragY(0);
                }}
                className="text-muted hover:text-ink"
                aria-label="Hide recommendations"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {recommendations.length === 0 && (
                <p className="p-4 text-center text-xs text-muted">
                  No other videos from your subscriptions yet.
                </p>
              )}
              {recommendations.map(({ video: v, channel: c }) => (
                <button
                  key={v.id}
                  onClick={() => selectVideo(v)}
                  className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-paper"
                >
                  <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-line">
                    {v.thumbnail_url && (
                      <Image src={v.thumbnail_url} alt={v.title} fill className="object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-ink">{v.title}</p>
                    <p className="mt-1 truncate text-xs text-muted">{c.title}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}