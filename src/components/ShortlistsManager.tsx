"use client";

import { useState } from "react";
import Link from "next/link";
import { ArchetypeBadge } from "@/components/ArchetypeBadge";
import type { Archetype, Shortlist } from "@/lib/types";

export interface ShortlistDeveloper {
  id: string;
  name: string;
  archetype: Archetype;
}

/** Your shortlists: rename, remove members, delete. */
export function ShortlistsManager({
  initial,
  developers,
  sources,
}: {
  initial: Shortlist[];
  /** Everyone who appears on any of the lists. */
  developers: Record<string, ShortlistDeveloper>;
  /** analysisId → what it was run on ("acme/shop", or a described need). */
  sources: Record<string, string>;
}) {
  const [lists, setLists] = useState(initial);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json as T;
  }

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

  const replace = (s: Shortlist) => setLists((all) => all.map((x) => (x.id === s.id ? s : x)));

  const removeMember = (list: Shortlist, devId: string) =>
    run(async () => {
      const { shortlist } = await request<{ shortlist: Shortlist }>(`/api/shortlists/${list.id}`, {
        method: "PATCH",
        body: JSON.stringify({ remove: devId }),
      });
      replace(shortlist);
    });

  const saveName = () =>
    renaming &&
    run(async () => {
      const { shortlist } = await request<{ shortlist: Shortlist }>(`/api/shortlists/${renaming.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renaming.name }),
      });
      replace(shortlist);
      setRenaming(null);
    });

  const remove = (list: Shortlist) => {
    if (!window.confirm(`Delete the shortlist "${list.name}"? The developers stay in the cohort.`)) return;
    void run(async () => {
      await request(`/api/shortlists/${list.id}`, { method: "DELETE" });
      setLists((all) => all.filter((x) => x.id !== list.id));
    });
  };

  if (lists.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-line-strong bg-surface p-12 text-center">
        <p className="text-sm font-bold text-heading">No shortlists yet</p>
        <p className="mt-1.5 text-xs text-muted">
          Add developers from a fit result or a developer&rsquo;s page.
        </p>
        <Link
          href="/fit"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-accent-contrast transition hover:bg-accent-hover"
        >
          Check fit <span aria-hidden>→</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {error && (
        <div className="rounded-xl border border-danger-line bg-danger-bg p-3 text-sm font-medium text-danger-fg">
          {error}
        </div>
      )}
      {lists.map((list) => (
        <section key={list.id} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {renaming?.id === list.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveName();
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: list.id, name: e.target.value })}
                    maxLength={80}
                    aria-label="Shortlist name"
                    autoFocus
                    className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-heading focus:border-accent focus:outline-none"
                  />
                  <button type="submit" disabled={busy} className="text-xs font-bold text-accent-soft-fg">
                    Save
                  </button>
                  <button type="button" onClick={() => setRenaming(null)} className="text-xs text-muted">
                    Cancel
                  </button>
                </form>
              ) : (
                <h2 className="truncate text-base font-bold text-heading">{list.name}</h2>
              )}
              <p className="mt-0.5 text-xs text-muted">
                {list.developerIds.length} developer{list.developerIds.length === 1 ? "" : "s"}
                {list.analysisId && sources[list.analysisId] && ` · from ${sources[list.analysisId]}`}
                {` · updated ${list.updatedAt.slice(0, 10)}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRenaming({ id: list.id, name: list.name })}
                className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-body hover:text-heading"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => remove(list)}
                disabled={busy}
                className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-body hover:border-danger-line hover:text-danger-fg"
              >
                Delete
              </button>
            </div>
          </div>

          {list.developerIds.length > 0 && (
            <ul className="mt-4 divide-y divide-line">
              {list.developerIds.map((id) => {
                const dev = developers[id];
                return (
                  <li key={id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      {dev ? (
                        <>
                          <Link
                            href={`/developer/${id}`}
                            className="truncate text-sm font-semibold text-heading underline-offset-4 hover:underline"
                          >
                            {dev.name}
                          </Link>
                          <ArchetypeBadge archetype={dev.archetype} />
                        </>
                      ) : (
                        <span className="text-sm text-muted">{id} (no longer in the cohort)</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeMember(list, id)}
                      disabled={busy}
                      aria-label={`Remove ${dev?.name ?? id} from ${list.name}`}
                      className="text-xs font-semibold text-muted hover:text-danger-fg"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
