"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShortlistButton } from "./ShortlistButton";

/**
 * The action bar on a Profile Analyzer report: add to the shared pool, then
 * shortlist / open the developer; re-analyze; delete the report.
 */
export function ProfileActions({
  reportId,
  login,
  developerId,
  inPool,
  canPool,
  poolBlockedReason,
}: {
  reportId: string;
  login: string;
  developerId: string;
  inPool: boolean;
  /** False when there are no authored commits to score. */
  canPool: boolean;
  /** Shown when `canPool` is false. */
  poolBlockedReason: string;
}) {
  const router = useRouter();
  const [pooled, setPooled] = useState(inPool);
  const [busy, setBusy] = useState<null | "pool" | "rerun" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(kind: "pool" | "rerun" | "delete", fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function request(url: string, init: RequestInit) {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
  }

  const addToPool = () =>
    run("pool", async () => {
      const json = await request(`/api/profiles/${reportId}/pool`, { method: "POST" });
      setPooled(true);
      setNotice(
        json.result === "unchanged"
          ? "Already in the pool with newer data; kept as is."
          : "Added to the developer pool. You can now shortlist, tag and rank them."
      );
      router.refresh();
    });

  const rerun = () =>
    run("rerun", async () => {
      const json = await request("/api/profiles", { method: "POST", body: JSON.stringify({ login }) });
      // Same (user, login) → same report id, but navigate anyway in case it changed.
      router.push(`/profiles/${json.reportId}`);
      router.refresh();
    });

  const remove = () => {
    if (!window.confirm(`Delete your report on @${login}? The developer pool isn't affected.`)) return;
    void run("delete", async () => {
      await request(`/api/profiles/${reportId}`, { method: "DELETE" });
      router.push("/profiles");
      router.refresh();
    });
  };

  const secondary =
    "inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-body transition hover:border-line-strong hover:text-heading disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="flex flex-col gap-2 md:items-end">
      <div className="flex flex-wrap gap-2 md:justify-end">
        {pooled ? (
          <>
            <ShortlistButton developerId={developerId} analysisId={null} suggestedName={`@${login}`} />
            <Link href={`/developer/${developerId}`} className={secondary}>
              Notes, tags &amp; pool profile <span aria-hidden>→</span>
            </Link>
          </>
        ) : (
          <button
            type="button"
            onClick={addToPool}
            disabled={!canPool || busy !== null}
            title={canPool ? undefined : poolBlockedReason}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-contrast shadow-brand transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "pool" ? "Adding…" : "+ Add to developer pool"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <button type="button" onClick={rerun} disabled={busy !== null} className={secondary}>
          {busy === "rerun" ? "Re-analyzing…" : "Re-analyze"}
        </button>
        <button type="button" onClick={remove} disabled={busy !== null} className={secondary}>
          {busy === "delete" ? "Deleting…" : "Delete report"}
        </button>
      </div>
      {!pooled && !canPool && (
        <p className="max-w-xs text-xs text-muted md:text-right">Can&rsquo;t be added to the pool. {poolBlockedReason}</p>
      )}
      {notice && <p className="max-w-xs text-xs text-ok-fg md:text-right">{notice}</p>}
      {error && (
        <p role="alert" className="max-w-xs text-xs text-danger-fg md:text-right">
          {error}
        </p>
      )}
    </div>
  );
}
