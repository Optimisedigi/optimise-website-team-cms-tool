"use client";

import { useState } from "react";
import type { GoogleAdsDashboardNote } from "@/lib/dashboard-types";

interface NotesSectionProps {
  notes: GoogleAdsDashboardNote[];
  workDone: Array<{ description: string; date: string }>;
  slug?: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function NotesSection({ notes: initialNotes, workDone, slug }: NotesSectionProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [newText, setNewText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function addNote() {
    const text = newText.trim();
    if (!text || !slug) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/notes?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text, author: "Team" }),
      });
      if (res.ok) {
        const { note } = await res.json();
        setNotes((prev) => [...prev, note]);
        setNewText("");
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(noteId: string) {
    if (!slug) return;
    setDeletingId(noteId);
    try {
      const res = await fetch(
        `/api/dashboard/notes?slug=${encodeURIComponent(slug)}&noteId=${encodeURIComponent(noteId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      }
    } finally {
      setDeletingId(null);
    }
  }

  const hasContent = notes.length > 0 || workDone.length > 0;

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-3">
        Notes &amp; Key Callouts
      </h2>

      {hasContent && (
        <ul className="space-y-2 mb-4">
          {workDone.map((w, i) => (
            <li key={`work-${i}`} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="text-emerald-500 mt-0.5">&bull;</span>
              <span>
                {w.description}
                <span className="text-slate-400 ml-1.5 text-xs">
                  ({formatDate(w.date)})
                </span>
              </span>
            </li>
          ))}
          {notes.map((note) => (
            <li key={note.id} className="flex items-start gap-2 text-sm text-slate-700 group">
              <span className="text-blue-500 mt-0.5">&bull;</span>
              <span className="flex-1">
                {note.text}
                <span className="text-slate-400 ml-1.5 text-xs">
                  {note.author} &middot; {formatDate(note.createdAt)}
                </span>
              </span>
              {slug && (
                <button
                  onClick={() => deleteNote(note.id)}
                  disabled={deletingId === note.id}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all text-xs px-1"
                  title="Remove note"
                >
                  {deletingId === note.id ? "..." : "\u00d7"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!hasContent && (
        <p className="text-sm text-slate-400 mb-4">No notes yet</p>
      )}

      {slug && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                addNote();
              }
            }}
            placeholder="Add a note or callout..."
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={addNote}
            disabled={saving || !newText.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}
