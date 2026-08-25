"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function RefreshButton({ onRefreshed }: { onRefreshed: () => void }) {
  const [nextAllowedAt, setNextAllowedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/videos/refresh")
      .then((res) => res.json())
      .then((data) =>
        setNextAllowedAt(data.nextAllowedAt ? new Date(data.nextAllowedAt).getTime() : null)
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const disabled = loading || (nextAllowedAt !== null && nextAllowedAt > now);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/videos/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setNextAllowedAt(data.nextAllowedAt ? new Date(data.nextAllowedAt).getTime() : null);
        setError("Already refreshed recently.");
        return;
      }
      setNextAllowedAt(new Date(data.nextAllowedAt).getTime());
      onRefreshed();
    } catch {
      setError("Refresh failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={disabled}
        title={disabled && nextAllowedAt ? `Refresh in ${formatRemaining(nextAllowedAt - now)}` : undefined}
        className="rounded-md border border-line bg-card px-3 py-1.5 text-xs text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? "Refreshing…" : "Refresh"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}