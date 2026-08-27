"use client";

import { useState } from "react";

export default function KeywordModal({
  channelTitle,
  initialKeywords,
  onSave,
  onClose,
}: {
  channelTitle: string;
  initialKeywords: string[];
  onSave: (keywords: string[]) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialKeywords.join(", "));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const keywords = value
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    await onSave(keywords);
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-line bg-card p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-sm text-ink">{channelTitle}</h3>
        <p className="mb-3 text-xs text-muted">
          Enter keyword(s) that should appear in a video's title for it to show up from this
          channel. Separate multiple keywords with commas — a video matching any one of them
          will be shown. Leave empty to show every video from this channel.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. tutorial, review"
          className="mb-4 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-ink px-3 py-1.5 text-xs text-paper hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}