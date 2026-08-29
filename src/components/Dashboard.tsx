"use client";

import { useEffect, useState } from "react";
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

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[27px] tracking-tight">Focus</h1>
          <p className="text-[13px] text-muted">{userEmail}</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleColorful}
            className={`rounded-md border px-3 py-1.5 text-xs transition ${
              colorful
                ? "border-ink bg-ink text-paper"
                : "border-line bg-card text-muted hover:text-ink"
            }`}
            title="Toggle colorful thumbnails"
          >
            {colorful ? "Color: On" : "Color: Off"}
          </button>
          <RefreshButton onRefreshed={applyFeed} />
          <button onClick={signOut} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            Sign out
          </button>
        </div>
      </header>

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

      <VideoModal video={playing} onClose={() => setPlaying(null)} />
    </main>
  );
}