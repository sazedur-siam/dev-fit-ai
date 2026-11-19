"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Username or profile URL in, report page out. The server does the cleaning. */
export function ProfileAnalyzerForm({ initialLogin }: { initialLogin: string }) {
  const router = useRouter();
  const [login, setLogin] = useState(initialLogin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Analysis failed (${res.status})`);
      router.push(`/profiles/${json.reportId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5">
      <label htmlFor="gh-login" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
        GitHub username or profile URL
      </label>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <input
          id="gh-login"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="octocat or https://github.com/octocat"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-heading placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
        />
        <button
          type="submit"
          disabled={busy || !login.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-contrast shadow-brand transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Analyzing… (~10–15s)" : "Analyze profile"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-sm text-danger-fg">
          {error}
        </p>
      )}
    </form>
  );
}
