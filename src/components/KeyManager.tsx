"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
      // Whether a key exists drives the /fit warning banner and the admin roster,
      // so invalidate the client cache rather than let those go stale.
      router.refresh();
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
      router.refresh();
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
        <div className="rounded-xl border border-danger-line bg-danger-bg p-3.5 text-sm font-medium text-danger-fg">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-ok-line bg-ok-bg p-3.5 text-sm font-medium text-ok-fg">
          {notice}
        </div>
      )}

      {statuses.map((status) => {
        const meta = META[status.kind];
        const isBusy = busy === status.kind;
        return (
          <section
            key={status.kind}
            className="rounded-2xl border border-line bg-surface p-5 shadow-card"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-heading">{meta.label}</h2>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-body">
                  {meta.help}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  status.isSet
                    ? "bg-ok-bg text-ok-fg ring-1 ring-inset ring-ok-line"
                    : "bg-surface-2 text-muted ring-1 ring-inset ring-line"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${
                    status.isSet ? "bg-accent" : "bg-faint"
                  }`}
                />
                {status.isSet ? "Saved" : "Not set"}
              </span>
            </div>

            {status.isSet && (
              <p className="mt-3 text-xs text-muted">
                Stored as <code className="font-mono">{status.preview}</code>
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
                placeholder={
                  status.isSet ? "Paste a new value to replace" : meta.placeholder
                }
                aria-label={meta.label}
                className="flex-1 rounded-lg border border-line bg-surface px-3.5 py-2.5 font-mono text-sm text-heading placeholder:font-sans placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
              />
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void save(status.kind)}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-contrast transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBusy ? "Saving…" : status.isSet ? "Update" : "Save"}
              </button>
              {status.isSet && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void remove(status.kind)}
                  className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-body transition hover:border-danger-line hover:bg-danger-bg hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete
                </button>
              )}
            </div>

            <a
              href={meta.link}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs font-semibold text-accent-soft-fg transition hover:text-accent"
            >
              {meta.linkLabel} →
            </a>
          </section>
        );
      })}

      <p className="text-xs leading-relaxed text-muted">
        Keys are encrypted with AES-256-GCM before they are written to the
        database, and are never sent back to the browser — only the masked preview
        above. Deleting one removes it immediately; the app then falls back to a
        server-configured key if the deployment has one.
      </p>
    </div>
  );
}
