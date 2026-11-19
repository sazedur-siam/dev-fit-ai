"use client";

import { useState } from "react";
import Link from "next/link";
import type { DeveloperNote, Shortlist } from "@/lib/types";

const INPUT_CLASS =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-heading placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line";
const SMALL_BUTTON =
  "rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-body transition hover:border-accent hover:text-heading disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY_BUTTON =
  "rounded-lg bg-accent px-3.5 py-2 text-xs font-bold text-accent-contrast transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

/**
 * Your private workspace for one developer: tags, notes, and which of your
 * shortlists they're on. Nothing here is visible to anyone else, admins included.
 */
export function DeveloperWorkspace({
  developerId,
  initialNotes,
  initialTags,
  initialShortlists,
}: {
  developerId: string;
  initialNotes: DeveloperNote[];
  initialTags: string[];
  initialShortlists: Shortlist[];
}) {
  const base = `/api/developers/${encodeURIComponent(developerId)}`;
  const [error, setError] = useState<string | null>(null);

  // Tags
  const [tags, setTags] = useState(initialTags);
  const [tagDraft, setTagDraft] = useState("");
  // Notes
  const [notes, setNotes] = useState(initialNotes);
  const [noteDraft, setNoteDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  // Shortlists
  const [shortlists, setShortlists] = useState(initialShortlists);
  const [newListName, setNewListName] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const addTag = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { tags: next } = await call<{ tags: string[] }>(`${base}/tags`, {
        method: "POST",
        body: JSON.stringify({ label: tagDraft }),
      });
      setTags(next);
      setTagDraft("");
    });
  };

  const removeTag = (label: string) =>
    run(async () => {
      const { tags: next } = await call<{ tags: string[] }>(
        `${base}/tags?label=${encodeURIComponent(label)}`,
        { method: "DELETE" }
      );
      setTags(next);
    });

  const addNote = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { note } = await call<{ note: DeveloperNote }>(`${base}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: noteDraft }),
      });
      setNotes((n) => [note, ...n]);
      setNoteDraft("");
    });
  };

  const saveEdit = () =>
    editing &&
    run(async () => {
      const { note } = await call<{ note: DeveloperNote }>(`/api/notes/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body: editing.body }),
      });
      setNotes((n) => n.map((x) => (x.id === note.id ? note : x)));
      setEditing(null);
    });

  const deleteNote = (id: string) => {
    if (!window.confirm("Delete this note?")) return;
    void run(async () => {
      await call(`/api/notes/${id}`, { method: "DELETE" });
      setNotes((n) => n.filter((x) => x.id !== id));
    });
  };

  const toggleShortlist = (list: Shortlist) =>
    run(async () => {
      const on = list.developerIds.includes(developerId);
      const { shortlist } = await call<{ shortlist: Shortlist }>(`/api/shortlists/${list.id}`, {
        method: "PATCH",
        body: JSON.stringify(on ? { remove: developerId } : { add: developerId }),
      });
      setShortlists((all) => all.map((s) => (s.id === shortlist.id ? shortlist : s)));
    });

  const createShortlist = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { shortlist } = await call<{ shortlist: Shortlist }>("/api/shortlists", {
        method: "POST",
        body: JSON.stringify({ name: newListName, developerIds: [developerId] }),
      });
      setShortlists((all) => [shortlist, ...all]);
      setNewListName("");
    });
  };

  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-heading">Your notes</h2>
        <span className="text-xs text-muted">Private to you</span>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-danger-line bg-danger-bg p-3 text-sm font-medium text-danger-fg">
          {error}
        </div>
      )}

      {/* Tags */}
      <div className="mt-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Tags</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-md bg-surface-2 py-0.5 pl-2 pr-1 text-[11px] font-medium text-body ring-1 ring-inset ring-line"
            >
              {t}
              <button
                type="button"
                onClick={() => void removeTag(t)}
                disabled={busy}
                aria-label={`Remove tag ${t}`}
                className="rounded px-1 text-muted hover:text-danger-fg"
              >
                ×
              </button>
            </span>
          ))}
          <form onSubmit={addTag} className="flex items-center gap-1.5">
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              placeholder="add tag…"
              maxLength={40}
              aria-label="New tag"
              className="w-32 rounded-md border border-line bg-surface px-2 py-1 text-xs text-heading placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button type="submit" disabled={busy || !tagDraft.trim()} className={SMALL_BUTTON}>
              Add
            </button>
          </form>
        </div>
      </div>

      {/* Shortlists */}
      <div className="mt-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
          Shortlists
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {shortlists.map((s) => {
            const on = s.developerIds.includes(developerId);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() => void toggleShortlist(s)}
                className={`rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                  on
                    ? "bg-accent-soft text-accent-soft-fg ring-accent-line"
                    : "text-body ring-line hover:text-heading"
                }`}
              >
                {on ? "✓ " : "+ "}
                {s.name}
              </button>
            );
          })}
          <form onSubmit={createShortlist} className="flex items-center gap-1.5">
            <input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="new shortlist…"
              maxLength={80}
              aria-label="New shortlist name"
              className="w-40 rounded-md border border-line bg-surface px-2 py-1 text-xs text-heading placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button type="submit" disabled={busy || !newListName.trim()} className={SMALL_BUTTON}>
              Create
            </button>
          </form>
          <Link href="/shortlists" className="ml-1 text-xs font-semibold text-muted underline-offset-4 hover:text-heading hover:underline">
            Manage
          </Link>
        </div>
      </div>

      {/* Notes */}
      <form onSubmit={addNote} className="mt-5">
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={3}
          maxLength={5000}
          placeholder="e.g. Talked on 12 Nov: available from March, keen on backend work."
          aria-label="New note"
          className={INPUT_CLASS}
        />
        <div className="mt-2 flex justify-end">
          <button type="submit" disabled={busy || !noteDraft.trim()} className={PRIMARY_BUTTON}>
            Save note
          </button>
        </div>
      </form>

      {notes.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {notes.map((n) => (
            <li key={n.id} className="py-3">
              {editing?.id === n.id ? (
                <div>
                  <textarea
                    value={editing.body}
                    onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                    rows={3}
                    maxLength={5000}
                    aria-label="Edit note"
                    className={INPUT_CLASS}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => setEditing(null)} className={SMALL_BUTTON}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      disabled={busy || !editing.body.trim()}
                      className={PRIMARY_BUTTON}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">{n.body}</p>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted">
                    <span>
                      {n.createdAt.slice(0, 10)}
                      {n.updatedAt !== n.createdAt && " (edited)"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing({ id: n.id, body: n.body })}
                      className="font-semibold hover:text-heading"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteNote(n.id)}
                      className="font-semibold hover:text-danger-fg"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
