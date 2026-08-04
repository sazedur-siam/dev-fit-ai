"use client";

import { useMemo, useState } from "react";
import type { ViewerRepoList } from "@/lib/types";

type PickerState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: ViewerRepoList };

/**
 * Lists the repositories the configured GITHUB_TOKEN can see and lets one be
 * pushed into the fit form. There is no auth in this app, so "current user"
 * means "owner of GITHUB_TOKEN".
 */
export function RepoPicker({
  onSelect,
  disabled,
}: {
  onSelect: (repoUrl: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PickerState>({ kind: "idle" });
  const [filter, setFilter] = useState("");

  async function load() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/repos");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not list repositories");
      setState({ kind: "ready", data: json as ViewerRepoList });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not list repositories",
      });
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && state.kind === "idle") void load();
  }

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    const q = filter.trim().toLowerCase();
    if (!q) return state.data.repos;
    return state.data.repos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.language || "").toLowerCase().includes(q)
    );
  }, [state, filter]);

  return (
    <div className="mt-4 border-t border-ink-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex items-center gap-2 text-sm font-medium text-pine-700 hover:text-pine-600"
        >
          <span
            aria-hidden
            className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}
          >
            ▸
          </span>
          {state.kind === "ready"
            ? `Your repositories (${state.data.repos.length})`
            : "Browse your GitHub repositories"}
        </button>

        {state.kind === "ready" && (
          <span className="text-xs text-ink-400">
            signed in as{" "}
            <span className="font-medium text-ink-600">
              {state.data.login}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              className="ml-3 rounded-md border border-ink-200 px-2 py-0.5 font-medium text-ink-600 hover:border-pine-500/40 hover:text-pine-700"
            >
              Refresh
            </button>
          </span>
        )}
      </div>

      {open && (
        <div className="mt-3">
          {state.kind === "loading" && (
            <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white p-4 text-sm text-ink-600">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-pine-600 motion-reduce:animate-none" />
              Reading your repositories…
            </div>
          )}

          {state.kind === "error" && (
            <div className="rounded-lg border border-brick-500/30 bg-brick-50 p-4 text-sm text-brick-600">
              <div className="font-semibold">Couldn&rsquo;t list repositories</div>
              <div className="mt-1 whitespace-pre-wrap text-xs">
                {state.message}
              </div>
              <div className="mt-2 text-xs text-ink-600">
                This needs <code>GITHUB_TOKEN</code> in <code>.env.local</code>.
                A fine-grained token only returns what it was granted — a
                public-repos-only token won&rsquo;t list private repos.
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-md bg-brick-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brick-500"
              >
                Try again
              </button>
            </div>
          )}

          {state.kind === "ready" && (
            <>
              {state.data.repos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-ink-200 bg-white p-6 text-center text-sm text-ink-600">
                  This token can&rsquo;t see any repositories.
                </p>
              ) : (
                <>
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter repositories…"
                    aria-label="Filter your repositories"
                    className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
                  />
                  <ul className="mt-2 max-h-72 divide-y divide-ink-200 overflow-y-auto rounded-lg border border-ink-200 bg-white">
                    {visible.map((repo) => (
                      <li key={repo.fullName}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            onSelect(repo.htmlUrl);
                            setOpen(false);
                          }}
                          className="flex w-full flex-col gap-1 p-3 text-left transition hover:bg-pine-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-ink-900">
                              {repo.fullName}
                            </span>
                            {repo.isPrivate && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-600">
                                private
                              </span>
                            )}
                            {repo.isFork && (
                              <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-600">
                                fork
                              </span>
                            )}
                          </span>
                          {repo.description && (
                            <span className="line-clamp-1 text-xs text-ink-600">
                              {repo.description}
                            </span>
                          )}
                          <span className="flex flex-wrap gap-3 text-[11px] text-ink-400">
                            {repo.language && <span>{repo.language}</span>}
                            <span>★ {repo.stars}</span>
                            <span>pushed {repo.updatedAt.slice(0, 10)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                    {visible.length === 0 && (
                      <li className="p-4 text-center text-xs text-ink-400">
                        No repository matches &ldquo;{filter}&rdquo;.
                      </li>
                    )}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
