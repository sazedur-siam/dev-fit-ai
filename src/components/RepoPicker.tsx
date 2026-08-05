"use client";

import { useMemo, useState } from "react";
import type { ViewerRepoList } from "@/lib/types";

type PickerState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: ViewerRepoList };

/**
 * Lists the repositories the signed-in user's stored GitHub token can see and
 * lets one be pushed into the fit form.
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
        message:
          err instanceof Error ? err.message : "Could not list repositories",
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
    <div className="mt-5 border-t border-line pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex items-center gap-2 text-sm font-semibold text-accent-soft-fg transition hover:text-accent"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          {state.kind === "ready"
            ? `Your repositories (${state.data.repos.length})`
            : "Browse your GitHub repositories"}
        </button>

        {state.kind === "ready" && (
          <span className="flex items-center gap-3 text-xs text-muted">
            <span>
              signed in as{" "}
              <span className="font-semibold text-body">{state.data.login}</span>
            </span>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-line px-2.5 py-1 font-semibold text-body transition hover:border-accent hover:text-accent-soft-fg"
            >
              Refresh
            </button>
          </span>
        )}
      </div>

      {open && (
        <div className="mt-3">
          {state.kind === "loading" && (
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-4 text-sm text-body">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent motion-reduce:animate-none" />
              Reading your repositories…
            </div>
          )}

          {state.kind === "error" && (
            <div className="rounded-xl border border-danger-line bg-danger-bg p-4 text-sm">
              <div className="font-bold text-danger-fg">
                Couldn&rsquo;t list repositories
              </div>
              <div className="mt-1 whitespace-pre-wrap text-xs text-danger-fg">
                {state.message}
              </div>
              <div className="mt-2 text-xs text-body">
                This needs a GitHub token saved in Settings (or{" "}
                <code>GITHUB_TOKEN</code> on the server). A fine-grained token
                only returns what it was granted — a public-repos-only token
                won&rsquo;t list private repos.
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-lg bg-brick-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brick-500"
              >
                Try again
              </button>
            </div>
          )}

          {state.kind === "ready" && (
            <>
              {state.data.repos.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong bg-surface p-6 text-center text-sm text-body">
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
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-heading placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
                  />
                  <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface">
                    {visible.map((repo) => (
                      <li key={repo.fullName}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            onSelect(repo.htmlUrl);
                            setOpen(false);
                          }}
                          className="flex w-full flex-col gap-1 p-3 text-left transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-heading">
                              {repo.fullName}
                            </span>
                            {repo.isPrivate && (
                              <span className="rounded bg-warn-bg px-1.5 py-0.5 text-[10px] font-bold uppercase text-warn-fg">
                                private
                              </span>
                            )}
                            {repo.isFork && (
                              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
                                fork
                              </span>
                            )}
                          </span>
                          {repo.description && (
                            <span className="line-clamp-1 text-xs text-body">
                              {repo.description}
                            </span>
                          )}
                          <span className="flex flex-wrap gap-3 text-[11px] text-muted">
                            {repo.language && <span>{repo.language}</span>}
                            <span>★ {repo.stars}</span>
                            <span>pushed {repo.updatedAt.slice(0, 10)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                    {visible.length === 0 && (
                      <li className="p-4 text-center text-xs text-muted">
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
