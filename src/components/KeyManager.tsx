"use client";

import { useState } from "react";
import type { KeyKind, KeyStatus } from "@/lib/types";

const META: Record<
  KeyKind,
  { label: string; help: string; link: string; linkLabel: string; placeholder: string }
> = {
  gemini: {
    label: "Gemini API key",
    help: "Required to analyse a repository. Used for the two model calls per fit run.",
    link: "https://aistudio.google.com/app/apikey",
    linkLabel: "Get a key",
    placeholder: "AQ.Ab8… or AIza…",
  },
  github: {
    label: "GitHub token",
    help: "Optional for public repos, required to list your own repositories. Raises the rate limit from 60 to 5,000 req/hr.",
    link: "https://github.com/settings/personal-access-tokens",
    linkLabel: "Create a token",
    placeholder: "github_pat_… or ghp_…",
  },
};

export function KeyManager({ initial }: { initial: KeyStatus[] }) {
  const [statuses, setStatuses] = useState<KeyStatus[]>(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<KeyKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function replace(next: KeyStatus) {
    setStatuses((prev) => prev.map((s) => (s.kind === next.kind ? next : s)));
  }

  async function save(kind: KeyKind) {
    const value = (drafts[kind] ?? "").trim();
    if (!value) {
      setError("Paste a value first.");
      return;
    }
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not save key");
      replace(json.key as KeyStatus);
      setDrafts((prev) => ({ ...prev, [kind]: "" }));
      setNotice(`${META[kind].label} saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save key");
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind: KeyKind) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/keys?kind=${kind}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not delete key");
      setStatuses(json.keys as KeyStatus[]);
      setNotice(`${META[kind].label} removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete key");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-brick-500/30 bg-brick-50 p-3 text-sm text-brick-600">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-pine-500/30 bg-pine-50 p-3 text-sm text-pine-700">
          {notice}
        </div>
      )}

      {statuses.map((status) => {
        const meta = META[status.kind];
        const isBusy = busy === status.kind;
        return (
          <section
            key={status.kind}
            className="rounded-xl border border-ink-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink-900">{meta.label}</h2>
                <p className="mt-1 max-w-xl text-xs text-ink-600">{meta.help}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                  status.isSet
                    ? "bg-pine-50 text-pine-700 ring-pine-500/20"
                    : "bg-ink-100 text-ink-600 ring-ink-200"
                }`}
              >
                {status.isSet ? "Saved" : "Not set"}
              </span>
            </div>

            {status.isSet && (
              <p className="mt-3 text-xs text-ink-400">
                Stored as{" "}
                <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-ink-800">
                  {status.preview}
                </code>
                {status.updatedAt && ` · updated ${status.updatedAt.slice(0, 10)}`}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                autoComplete="off"
                value={drafts[status.kind] ?? ""}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [status.kind]: e.target.value }))
                }
                placeholder={status.isSet ? "Paste a new value to replace" : meta.placeholder}
                aria-label={meta.label}
                className="flex-1 rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-sm text-ink-900 placeholder:font-sans placeholder:text-ink-400 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
              />
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void save(status.kind)}
                className="rounded-md bg-pine-600 px-4 py-2 text-sm font-medium text-white hover:bg-pine-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBusy ? "Saving…" : status.isSet ? "Update" : "Save"}
              </button>
              {status.isSet && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void remove(status.kind)}
                  className="rounded-md border border-ink-200 px-4 py-2 text-sm font-medium text-ink-600 hover:border-brick-500/40 hover:text-brick-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete
                </button>
              )}
            </div>

            <a
              href={meta.link}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs font-medium text-pine-700 hover:text-pine-600"
            >
              {meta.linkLabel} →
            </a>
          </section>
        );
      })}

      <p className="text-xs leading-relaxed text-ink-400">
        Keys are encrypted with AES-256-GCM before they are written to the
        database, and are never sent back to the browser — only the masked preview
        above. Deleting one removes it immediately; the app then falls back to a
        server-configured key if the deployment has one.
      </p>
    </div>
  );
}
