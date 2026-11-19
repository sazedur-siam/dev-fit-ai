"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SourceBadge } from "@/components/ArchetypeBadge";
import type { Archetype, DeveloperSource } from "@/lib/types";

export interface AdminDeveloperRow {
  id: string;
  name: string;
  archetype: Archetype;
  source: DeveloperSource;
  githubLogin: string | null;
  importedAt: string | null;
  repoCount: number;
  totalCommits: number;
}

const FIELD_CLASS =
  "mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-heading placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line";
const LABEL_CLASS = "text-[10px] font-bold uppercase tracking-[0.14em] text-muted";
const ROW_ACTION_CLASS =
  "rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-body transition hover:border-danger-line hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-40";

/** The cohort every fit run ranks against: import real developers, remove any. */
export interface LastRefreshSummary {
  at: string;
  refreshed: number;
  failed: number;
  stoppedForRateLimit: boolean;
}

export function AdminDevelopers({
  initial,
  lastRefresh,
}: {
  initial: AdminDeveloperRow[];
  /** Latest nightly refresh run, or null if it has never run. */
  lastRefresh: LastRefreshSummary | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [login, setLogin] = useState("");
  const [archetype, setArchetype] = useState<"auto" | Archetype>("auto");
  const [importing, setImporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function importDeveloper(e: React.FormEvent) {
    e.preventDefault();
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/developers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, archetype }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Import failed (${res.status})`);
        return;
      }
      const dev = json.developer;
      const row: AdminDeveloperRow = {
        id: dev.id,
        name: dev.name,
        archetype: dev.archetype,
        source: "github",
        githubLogin: dev.githubLogin ?? null,
        importedAt: dev.importedAt ?? null,
        repoCount: dev.repos.length,
        totalCommits: dev.totalCommits,
      };
      setRows((prev) => [row, ...prev.filter((r) => r.id !== row.id)]);
      setNotice(
        `${json.result === "inserted" ? "Imported" : "Refreshed"} ${dev.name}: ${row.repoCount} repos, ${row.totalCommits.toLocaleString()} commits, ${dev.archetype}.`
      );
      setLogin("");
      router.refresh(); // the header's developer count
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  async function remove(row: AdminDeveloperRow) {
    const consequence =
      row.source === "seed"
        ? "Sample developers come back the next time `npm run seed` runs."
        : "Re-import them to bring them back.";
    if (!window.confirm(`Remove ${row.name} from the cohort? ${consequence}`)) return;
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/developers/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Remove failed (${res.status})`);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setNotice(`Removed ${row.name}.`);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const sampleCount = rows.filter((r) => r.source === "seed").length;

  return (
    <section>
      <h2 className="text-lg font-bold text-heading">Developers</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-body">
        The cohort every fit run ranks against.
        {sampleCount > 0 &&
          ` ${sampleCount} of ${rows.length} are invented sample developers; import real ones and remove the samples when you're ready.`}
      </p>
      <p className="mt-1 text-xs text-muted">
        {lastRefresh
          ? `Nightly refresh last ran ${lastRefresh.at.slice(0, 16).replace("T", " ")} UTC: ${lastRefresh.refreshed} refreshed${
              lastRefresh.failed ? `, ${lastRefresh.failed} failed` : ""
            }${lastRefresh.stoppedForRateLimit ? ", stopped early for the GitHub rate limit" : ""}.`
          : "Nightly refresh hasn't run yet. It needs the GitHub Actions secrets described in CLAUDE.md."}
      </p>

      <form
        onSubmit={importDeveloper}
        className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-card"
      >
        <h3 className="text-sm font-bold text-heading">Import from GitHub</h3>
        <p className="mt-1 text-xs leading-relaxed text-body">
          Builds a profile from their <strong>public</strong> repositories: commits, languages,
          and frameworks read from package.json, requirements.txt, composer.json and similar.
          Only import people who know about it. Work in private repositories isn&rsquo;t
          visible, so some strong developers will look quieter than they are. Uses your
          GitHub token from Settings.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <label className="block">
            <span className={LABEL_CLASS}>GitHub username or profile URL</span>
            <input
              type="text"
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="octocat"
              autoComplete="off"
              spellCheck={false}
              className={FIELD_CLASS}
            />
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Archetype</span>
            <select
              value={archetype}
              onChange={(e) => setArchetype(e.target.value as "auto" | Archetype)}
              className={FIELD_CLASS}
            >
              <option value="auto">Detect automatically</option>
              <option value="frontend">Frontend</option>
              <option value="backend">Backend</option>
              <option value="fullstack">Fullstack</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={importing || !login.trim()}
            className="inline-flex h-10.5 items-center justify-center rounded-lg bg-accent px-5 text-sm font-bold text-accent-contrast shadow-brand transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? "Importing… (~10s)" : "Import"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-danger-line bg-danger-bg p-3.5 text-sm font-medium text-danger-fg">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-xl border border-ok-line bg-ok-bg p-3.5 text-sm font-medium text-ok-fg">
          {notice}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-160 text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.14em] text-muted">
              <th className="px-4 py-3 font-bold">Developer</th>
              <th className="px-4 py-3 font-bold">Source</th>
              <th className="px-4 py-3 font-bold">Archetype</th>
              <th className="px-4 py-3 text-right font-bold">Repos</th>
              <th className="px-4 py-3 text-right font-bold">Commits</th>
              <th className="px-4 py-3 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <Link
                    href={`/developer/${r.id}`}
                    className="font-semibold text-heading underline-offset-4 hover:text-accent-soft-fg hover:underline"
                  >
                    {r.name}
                  </Link>
                  {r.githubLogin && <div className="text-xs text-muted">@{r.githubLogin}</div>}
                </td>
                <td className="px-4 py-3">
                  <SourceBadge source={r.source} />
                  {r.importedAt && (
                    <div className="mt-1 text-[11px] text-muted">{r.importedAt.slice(0, 10)}</div>
                  )}
                </td>
                <td className="px-4 py-3 capitalize text-body">{r.archetype}</td>
                <td className="px-4 py-3 text-right tabular-nums text-body">{r.repoCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-body">
                  {r.totalCommits.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => remove(r)}
                    disabled={busyId === r.id}
                    className={ROW_ACTION_CLASS}
                  >
                    {busyId === r.id ? "Removing…" : "Remove"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                  No developers. Import one above, or run <code>npm run seed</code> for samples.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
