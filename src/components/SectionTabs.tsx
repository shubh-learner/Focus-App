"use client";

import { useState } from "react";

type Tab = { id: string; name: string };

export default function SectionTabs({
  tabs,
  activeId,
  onSelect,
  onReorder,
  onRename,
  onAddSection,
}: {
  tabs: Tab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onRename: (id: string, name: string) => void;
  onAddSection: () => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = tabs.map((t) => t.id);
    const fromIndex = ids.indexOf(dragId);
    const toIndex = ids.indexOf(targetId);
    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, dragId);
    onReorder(ids);
    setDragId(null);
  }

  function startEdit(tab: Tab) {
    setEditingId(tab.id);
    setEditValue(tab.name);
  }

  function commitEdit() {
    if (editingId && editValue.trim()) onRename(editingId, editValue.trim());
    setEditingId(null);
  }

  return (
    <div className="mb-8 flex items-center gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          draggable={editingId !== tab.id}
          onDragStart={() => setDragId(tab.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(tab.id)}
          onDoubleClick={() => startEdit(tab)}
          onClick={() => editingId !== tab.id && onSelect(tab.id)}
          className={`shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-3 py-2 text-sm transition select-none ${
            tab.id === activeId
              ? "border-ink text-ink"
              : "border-transparent text-muted hover:text-ink"
          } ${dragId === tab.id ? "opacity-40" : ""}`}
          title="Click to view · double-click to rename · drag to reorder"
        >
          {editingId === tab.id ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => e.key === "Enter" && commitEdit()}
              onClick={(e) => e.stopPropagation()}
              className="w-28 border-b border-accent bg-transparent outline-none"
            />
          ) : (
            tab.name
          )}
        </div>
      ))}
      <button
        onClick={onAddSection}
        className="shrink-0 whitespace-nowrap px-3 py-2 text-sm text-muted hover:text-ink"
      >
        + Section
      </button>
    </div>
  );
}