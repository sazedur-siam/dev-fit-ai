"use client";

import { useMemo, useState } from "react";
import type { Archetype, DeveloperView } from "@/lib/types";
import { DeveloperCard } from "./DeveloperCard";

const ARCHETYPE_LABELS: Record<Archetype, string> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Fullstack",
};

/**
 * Client-side filtering over the seeded cohort. The list is 10 developers held
 * in memory, so filtering in the browser is correct here — no need for a
 * round-trip or a search index.
 */
export function DeveloperBrowser({
  developers,
}: {
  developers: DeveloperView[];
}) {
  const [query, setQuery] = useState("");
  const [stacks, setStacks] = useState<string[]>([]);

  // Deduped case-insensitively, keeping the first-seen casing for display.
  const allStacks = useMemo(() => {
    const seen = new Map<string, string>();
    for (const dev of developers) {
      for (const lang of dev.languages) {
        const key = lang.trim().toLowerCase();
        if (key && !seen.has(key)) seen.set(key, lang.trim());
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [developers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const wanted = stacks.map((s) => s.toLowerCase());
    return developers.filter((dev) => {
      const matchesName = !q || dev.name.toLowerCase().includes(q);
      const devStacks = dev.languages.map((l) => l.toLowerCase());
      // Every selected stack must be present — selecting more narrows further.
      const matchesStacks = wanted.every((w) => devStacks.includes(w));
      return matchesName && matchesStacks;
    });
  }, [developers, query, stacks]);

  const isFiltering = query.trim().length > 0 || stacks.length > 0;

  function toggleStack(stack: string) {
    setStacks((prev) =>
      prev.includes(stack) ? prev.filter((s) => s !== stack) : [...prev, stack]
    );
  }

  function clearAll() {
    setQuery("");
    setStacks([]);
  }

  return (
    <div>
      <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className="h-4 w-4"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name…"
                aria-label="Filter developers by name"
                className="w-full rounded-lg border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-heading placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span aria-live="polite">
                Showing{" "}
                <span className="font-bold text-heading">{filtered.length}</span>{" "}
                of {developers.length}
              </span>
              {isFiltering && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg border border-line px-2.5 py-1.5 font-semibold text-body transition hover:border-accent hover:text-accent-soft-fg"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
              Stack{" "}
              <span className="font-medium normal-case tracking-normal">
                (matches all selected)
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {allStacks.map((stack) => {
                const active = stacks.includes(stack);
                return (
                  <button
                    key={stack}
                    type="button"
                    onClick={() => toggleStack(stack)}
                    aria-pressed={active}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                      active
                        ? "bg-accent text-accent-contrast shadow-brand"
                        : "bg-surface-2 text-body ring-1 ring-inset ring-line hover:bg-surface-3 hover:text-heading"
                    }`}
                  >
                    {stack}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line-strong bg-surface p-12 text-center">
          <p className="text-sm font-bold text-heading">
            No developer matches these filters
          </p>
          <p className="mt-1.5 text-xs text-muted">
            {stacks.length > 1
              ? "Stacks are combined with AND — try removing one."
              : "Try a different name or stack."}
          </p>
          <button
            type="button"
            onClick={clearAll}
            className="mt-5 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-accent-contrast transition hover:bg-accent-hover"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((dev) => (
            <DeveloperCard key={dev.id} dev={dev} />
          ))}
        </section>
      )}

      {/* Archetype counts, so a filtered view still shows the cohort shape. */}
      {filtered.length > 0 && (
        <p className="mt-5 text-xs text-muted">
          {(["frontend", "backend", "fullstack"] as Archetype[])
            .map(
              (a) =>
                `${filtered.filter((d) => d.archetype === a).length} ${ARCHETYPE_LABELS[a]}`
            )
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
