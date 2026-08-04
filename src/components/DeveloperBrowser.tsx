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
      <section className="mt-8 rounded-2xl border border-ink-200 bg-white p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name…"
                aria-label="Filter developers by name"
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-ink-400">
              <span aria-live="polite">
                Showing{" "}
                <span className="font-semibold text-ink-800">
                  {filtered.length}
                </span>{" "}
                of {developers.length}
              </span>
              {isFiltering && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-md border border-ink-200 px-2 py-1 font-medium text-ink-600 hover:border-pine-500/40 hover:text-pine-700"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-ink-400">
              Stack{" "}
              <span className="normal-case tracking-normal">
                (matches all selected)
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allStacks.map((stack) => {
                const active = stacks.includes(stack);
                return (
                  <button
                    key={stack}
                    type="button"
                    onClick={() => toggleStack(stack)}
                    aria-pressed={active}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                      active
                        ? "bg-pine-600 text-white"
                        : "bg-ink-100 text-ink-600 hover:bg-ink-200"
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
        <div className="mt-8 rounded-xl border border-dashed border-ink-200 bg-white p-10 text-center">
          <p className="text-sm font-medium text-ink-800">
            No developer matches these filters
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {stacks.length > 1
              ? "Stacks are combined with AND — try removing one."
              : "Try a different name or stack."}
          </p>
          <button
            type="button"
            onClick={clearAll}
            className="mt-4 rounded-md bg-pine-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pine-700"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((dev) => (
            <DeveloperCard key={dev.id} dev={dev} />
          ))}
        </section>
      )}

      {/* Archetype counts, so a filtered view still shows the cohort shape. */}
      {filtered.length > 0 && (
        <p className="mt-4 text-xs text-ink-400">
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
