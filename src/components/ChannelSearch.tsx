"use client";

import { useState } from "react";
import Image from "next/image";

type SearchResult = {
  channelId: string;
  title: string;
  thumbnailUrl: string;
  description: string;
};

export default function ChannelSearch({
  sectionId,
  subscribedChannelIds,
  onSubscribed,
  onUnsubscribed,
  onClose,
}: {
  sectionId: string;
  subscribedChannelIds: Set<string>;
  onSubscribed: (channel: SearchResult) => void;
  onUnsubscribed: (channelId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleSubscribe(channel: SearchResult) {
    setPending(channel.channelId);
    const isSubscribed = subscribedChannelIds.has(channel.channelId);
    try {
      if (isSubscribed) {
        await fetch("/api/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectionId, channelId: channel.channelId }),
        });
        onUnsubscribed(channel.channelId);
      } else {
        await fetch("/api/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionId,
            channelId: channel.channelId,
            channelTitle: channel.title,
            channelThumbnail: channel.thumbnailUrl,
          }),
        });
        onSubscribed(channel);
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/50 p-4 pt-20" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-line bg-card p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg">Find channels</h2>
          <button onClick={onClose} className="text-sm text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <form onSubmit={runSearch} className="mb-4 flex gap-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search YouTube channels…"
            className="flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "…" : "Search"}
          </button>
        </form>

        {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

        <div className="max-h-96 space-y-2 overflow-y-auto">
          {results.map((r) => {
            const subscribed = subscribedChannelIds.has(r.channelId);
            return (
              <div
                key={r.channelId}
                className="flex items-center gap-3 rounded-md border border-line bg-paper p-2"
              >
                {r.thumbnailUrl && (
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
                    <Image src={r.thumbnailUrl} alt={r.title} fill className="object-cover" />
                  </div>
                )}
                <p className="line-clamp-1 flex-1 text-sm">{r.title}</p>
                <button
                  onClick={() => toggleSubscribe(r)}
                  disabled={pending === r.channelId}
                  className={`shrink-0 rounded-md border px-3 py-1 text-xs transition ${
                    subscribed
                      ? "border-line bg-card text-muted hover:text-ink"
                      : "border-ink bg-ink text-paper hover:opacity-90"
                  }`}
                >
                  {pending === r.channelId ? "…" : subscribed ? "Subscribed" : "Subscribe"}
                </button>
              </div>
            );
          })}
          {!loading && results.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              Search for a channel by name to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
