"use client";

import { useState } from "react";
import type { Shortlist } from "@/lib/types";

/**
 * "Add to shortlist" on a fit result. Loads your shortlists when first opened;
 * a new list created here is linked to the analysis it came from.
 */
export function ShortlistButton({
  developerId,
  analysisId,
  suggestedName,
}: {
  developerId: string;
  analysisId: string | null;
  /** Pre-fills the "new shortlist" name, e.g. the repo or need. */
  suggestedName: string;
}) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<Shortlist[] | null>(null);
  const [name, setName] = useState(suggestedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json as T;
  }

  async function withBusy(fn: () => Promise<void>) {
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

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && lists === null) {
      void withBusy(async () => {
        setLists((await request<{ shortlists: Shortlist[] }>("/api/shortlists")).shortlists);
      });
    }
  }

  const toggle = (list: Shortlist) =>
    withBusy(async () => {
      const on = list.developerIds.includes(developerId);
      const { shortlist } = await request<{ shortlist: Shortlist }>(`/api/shortlists/${list.id}`, {
        method: "PATCH",
        body: JSON.stringify(on ? { remove: developerId } : { add: developerId }),
      });
      setLists((all) => (all ?? []).map((s) => (s.id === shortlist.id ? shortlist : s)));
    });

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    void withBusy(async () => {
      const { shortlist } = await request<{ shortlist: Shortlist }>("/api/shortlists", {
        method: "POST",
        body: JSON.stringify({ name, analysisId, developerIds: [developerId] }),
      });
      setLists((all) => [shortlist, ...(all ?? [])]);
    });
  };

  const onCount = (lists ?? []).filter((l) => l.developerIds.includes(developerId)).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-body transition hover:border-accent hover:text-heading"
      >
        {onCount > 0 ? `✓ On ${onCount} shortlist${onCount > 1 ? "s" : ""}` : "+ Shortlist"}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-line bg-surface p-3 text-left shadow-card-hover">
          {error && <p className="mb-2 text-xs font-medium text-danger-fg">{error}</p>}
          {lists === null ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {lists.length === 0 && <li className="text-xs text-muted">No shortlists yet.</li>}
              {lists.map((l) => {
                const on = l.developerIds.includes(developerId);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggle(l)}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-surface-2 ${
                        on ? "font-bold text-accent-soft-fg" : "text-body"
                      }`}
                    >
                      <span aria-hidden className="w-3">{on ? "✓" : ""}</span>
                      <span className="truncate">{l.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <form onSubmit={create} className="mt-3 flex gap-1.5 border-t border-line pt-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              aria-label="New shortlist name"
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-heading focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-bold text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
            >
              New
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
