"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SectionFeed, Video } from "@/lib/types";
import Section from "./Section";
import SectionTabs from "./SectionTabs";
import ChannelSearch from "./ChannelSearch";
import VideoModal from "./VideoModal";
import RefreshButton from "./RefreshButton";


export default function Dashboard({ userEmail }: { userEmail: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [feed, setFeed] = useState<SectionFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [searchingFor, setSearchingFor] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Video | null>(null);
  const [colorful, setColorful] = useState(false);
  const [order, setOrder] = useState<"time" | "random">("time");
  const [fullscreenEnabled, setFullscreenEnabled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openSettings() {
    setSettingsOpen(true);
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(() => setSettingsOpen(false), 5000);
  }

  useEffect(() => {
    return () => {
      if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    loadFeed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("focus:colorfulThumbnails");
    if (saved === "true") setColorful(true);
  }, []);

  function toggleColorful() {
    setColorful((prev) => {
      const next = !prev;
      localStorage.setItem("focus:colorfulThumbnails", String(next));
      return next;
    });
  }

  useEffect(() => {
    const saved = localStorage.getItem(`focus:videoOrder:${userEmail}`);
    if (saved === "random") setOrder("random");
  }, [userEmail]);

  function toggleOrder() {
    setOrder((prev) => {
      const next = prev === "time" ? "random" : "time";
      localStorage.setItem(`focus:videoOrder:${userEmail}`, next);
      return next;
    });
  }

  useEffect(() => {
    const saved = localStorage.getItem("focus:fullscreenPlayback");
    if (saved === "true") setFullscreenEnabled(true);
  }, []);

  function toggleFullscreen() {
    setFullscreenEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("focus:fullscreenPlayback", String(next));
      return next;
    });
  }

  async function loadFeed(preserveActive = true) {
    setLoading(true);
    const res = await fetch("/api/videos");
    const data = await res.json();
    if (res.ok) {
      setFeed(data.feed);
      const stillExists = data.feed.some((f: SectionFeed) => f.section.id === activeSectionId);
      if (!preserveActive || !stillExists) {
        setActiveSectionId(data.feed[0]?.section.id ?? null);
      }
    }
    setLoading(false);
  }

function applyFeed(newFeed: SectionFeed[]) {
  setFeed(newFeed);
  const stillExists = newFeed.some((f) => f.section.id === activeSectionId);
  if (!stillExists) setActiveSectionId(newFeed[0]?.section.id ?? null);
}

  async function addSection() {
    const name = window.prompt("Name this section (e.g. News, Spirituality, Technical):");
    if (!name || !name.trim()) return;
    const res = await fetch("/api/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      const { section } = await res.json();
      await loadFeed(false);
      setActiveSectionId(section.id);
    }
  }

  async function renameSection(sectionId: string, name: string) {
    await fetch(`/api/sections/${sectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    loadFeed();
  }

  async function deleteSection(sectionId: string) {
    if (!confirm("Delete this section and its subscriptions?")) return;
    await fetch(`/api/sections/${sectionId}`, { method: "DELETE" });
    await loadFeed(false);
  }

  // Reorders all sections given a new left-to-right array of section IDs.
  async function reorderSections(orderedIds: string[]) {
    // Optimistic local reorder so the drag feels instant.
    setFeed((prev) => {
      const byId = new Map(prev.map((f) => [f.section.id, f]));
      return orderedIds.map((id) => byId.get(id)!).filter(Boolean);
    });
    await Promise.all(
      orderedIds.map((id, index) =>
        fetch(`/api/sections/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: index }),
        })
      )
    );
    loadFeed();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const activeSectionFeed = feed.find((f) => f.section.id === searchingFor);
  const subscribedChannelIds = new Set(
    (activeSectionFeed?.channels ?? []).map((c) => c.channel.channel_id)
  );

  const active = feed.find((f) => f.section.id === activeSectionId);
  const seenVideoIds = new Set<string>();
  const allVideos = feed
    .flatMap((f) => f.channels.flatMap((c) => c.videos.map((v) => ({ video: v, channel: c.channel }))))
    .filter(({ video }) => {
      if (seenVideoIds.has(video.video_id)) return false;
      seenVideoIds.add(video.video_id);
      return true;
    })
    .sort((a, b) => new Date(b.video.published_at).getTime() - new Date(a.video.published_at).getTime());

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[27px] tracking-tight">Focus</h1>
          <p className="text-[13px] text-muted">{userEmail}</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={openSettings}
            aria-label="Settings"
            title="Settings"
            className="rounded-md border border-line bg-card p-2 text-muted hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <RefreshButton onRefreshed={applyFeed} />
          <button onClick={signOut} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            Sign out
          </button>
        </div>
      </header>
      <div
        onClick={openSettings}
        className={`overflow-hidden transition-all duration-300 ease-out ${
          settingsOpen ? "mb-6 max-h-20 translate-y-0 opacity-100" : "mb-0 max-h-0 -translate-y-2 opacity-0"
        }`}
      >
        <div className="flex flex-wrap items-center gap-6 rounded-md border border-line bg-card px-4 py-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleColorful();
              openSettings();
            }}
            className={`rounded-md border px-3 py-1.5 text-xs transition ${
              colorful ? "border-ink bg-ink text-paper" : "border-line bg-card text-muted hover:text-ink"
            }`}
          >
            Color
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
              openSettings();
            }}
            className={`rounded-md border px-3 py-1.5 text-xs transition ${
              fullscreenEnabled ? "border-ink bg-ink text-paper" : "border-line bg-card text-muted hover:text-ink"
            }`}
          >
            Fullscreen
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleOrder();
              openSettings();
            }}
            className={`rounded-md border px-3 py-1.5 text-xs transition ${
              order === "random" ? "border-ink bg-ink text-paper" : "border-line bg-card text-muted hover:text-ink"
            }`}
          >
            {order === "random" ? "Random" : "Order"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading your feed…</p>
      ) : feed.length === 0 ? (
        <div>
          <p className="mb-4 text-sm text-muted">
            Create your first section — try "News", "Spirituality", "Technical", or "Medical".
          </p>
          <button
            onClick={addSection}
            className="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90"
          >
            + Add section
          </button>
        </div>
      ) : (
        <>
          <SectionTabs
            tabs={feed.map((f) => ({ id: f.section.id, name: f.section.name }))}
            activeId={activeSectionId}
            onSelect={setActiveSectionId}
            onReorder={reorderSections}
            onRename={renameSection}
            onAddSection={addSection}
          />

          {active && (
            <Section
              data={active}
              colorful={colorful}
              order={order}
              onDelete={() => deleteSection(active.section.id)}
              onAddChannels={() => setSearchingFor(active.section.id)}
              onKeywordsChanged={() => loadFeed()}
              onPlay={setPlaying}
            />
          )}
        </>
      )}

      {searchingFor && (
        <ChannelSearch
          sectionId={searchingFor}
          subscribedChannelIds={subscribedChannelIds}
          onSubscribed={() => loadFeed()}
          onUnsubscribed={() => loadFeed()}
          onClose={() => setSearchingFor(null)}
        />
      )}

      <VideoModal
        video={playing}
        recommendedVideos={allVideos}
        fullscreenEnabled={fullscreenEnabled}
        onClose={() => setPlaying(null)}
      />
    </main>
  );
}