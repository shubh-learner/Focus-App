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
  const videoAreaRef = useRef<HTMLDivElement | null>(null);
  const DRAWER_PEEK = 250;

  useEffect(() => {
    setCurrentVideo(video);
    setDrawerOpen(false);
    setDragY(0);
  }, [video]);

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
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          fs: 1,
        },
        events: {
          onReady: () => {
            if (!fullscreenEnabled) return;
            videoAreaRef.current?.requestFullscreen?.().catch(() => {});
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
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartYRef.current = e.touches[0].clientY;
    setDragging(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartYRef.current === null) return;
    const delta = touchStartYRef.current - e.touches[0].clientY; // positive = swiped up
    if (!drawerOpen) {
      setDragY(Math.max(0, Math.min(delta, DRAWER_PEEK)));
    } else {
      setDragY(Math.max(0, Math.min(DRAWER_PEEK + delta, DRAWER_PEEK)));
    }
  }

  function handleTouchEnd() {
    setDragging(false);
    touchStartYRef.current = null;
    if (dragY > 90) {
      setDrawerOpen(true);
      setDragY(DRAWER_PEEK);
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

        <div ref={videoAreaRef} className="relative aspect-video w-full overflow-hidden bg-black">
          <div ref={containerRef} className="h-full w-full" />

          {/* Full-width swipe strip along the bottom edge of the video.
              Sits above the YouTube iframe (which otherwise swallows touch
              events), so a swipe anywhere along this strip opens the panel. */}
          {!drawerOpen && recommendations.length > 0 && (
            <div
              className="absolute inset-x-0 bottom-0 z-10 flex h-16 touch-none flex-col items-center justify-end gap-0.5 pb-2 text-white/80"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onClick={() => {
                setDrawerOpen(true);
                setDragY(DRAWER_PEEK);
              }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 15l-6-6-6 6" />
              </svg>
              <span className="text-[10px]">Swipe up for more</span>
            </div>
          )}


          <div
            className={`absolute inset-x-0 bottom-0 z-20 flex w-full flex-col rounded-t-xl border-t border-white/10 bg-card/10 backdrop-blur-md ${
              dragging ? "" : "transition-transform duration-300 ease-out"
            }`}
            style={{
              transform: dragging
                ? `translateY(calc(100% - ${dragY}px))`
                : drawerOpen
                ? "translateY(0)"
                : "translateY(100%)",
            }}
          >
            <div
              className="flex touch-none items-center justify-between border-b border-white/10 px-4 py-2"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <span className="text-xs text-white/70">Up next from your subscriptions</span>
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  setDragY(0);
                }}
                className="text-white/70 hover:text-white"
                aria-label="Hide recommendations"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>

            <div className="overflow-x-auto overflow-y-hidden p-2">
              {recommendations.length === 0 ? (
                <p className="p-4 text-center text-xs text-white/70">
                  No other videos from your subscriptions yet.
                </p>
              ) : (
                <div className="flex snap-x snap-mandatory gap-3">
                  {recommendations.map(({ video: v }) => (
                    <button
                      key={v.id}
                      onClick={() => selectVideo(v)}
                      aria-label={v.title}
                      title={v.title}
                      className="relative aspect-video h-16 shrink-0 snap-start overflow-hidden rounded-md bg-line transition hover:opacity-80"
                    >
                      {v.thumbnail_url && (
                        <Image src={v.thumbnail_url} alt="" fill className="object-cover" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}