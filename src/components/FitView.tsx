"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AiFluencyBadge, ArchetypeBadge, StackTag } from "@/components/ArchetypeBadge";
import { VerdictBadge } from "@/components/VerdictBadge";
import { SubScoreBar } from "@/components/SubScoreBar";
import { FullScreenLoader } from "@/components/FullScreenLoader";
import { RepoPicker } from "@/components/RepoPicker";
import type { DeveloperView, FitResponse } from "@/lib/types";

function isValidRepoUrl(input: string): boolean {
  return /^(?:https?:\/\/)?(?:www\.)?github\.com\/[^/\s]+\/[^/\s#?]+/i.test(
    input.trim()
  );
}

export function FitView({
  initialRepoUrl = "",
  hasGeminiKey,
  serverKeyAllowed,
}: {
  /** Pre-filled repo URL, from `/fit?repo=`. */
  initialRepoUrl?: string;
  hasGeminiKey: boolean;
  /** False for self-registered accounts, which never use the server's key. */
  serverKeyAllowed: boolean;
}) {
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading"; message: string }
    | { kind: "error"; message: string }
    | { kind: "result"; data: FitResponse; developers: DeveloperView[] }
  >({ kind: "idle" });

  const urlValid = useMemo(() => isValidRepoUrl(repoUrl), [repoUrl]);

  async function runFit(url: string) {
    if (!isValidRepoUrl(url)) {
      setState({
        kind: "error",
        message: "Paste a full GitHub URL like https://github.com/owner/repo",
      });
      return;
    }

    setState({ kind: "loading", message: "Analysing repository…" });

    try {
      const devsRes = await fetch("/api/developers");
      const devsJson = (await devsRes.json()) as { developers: DeveloperView[] };

      setState({ kind: "loading", message: "Ranking developers…" });

      const res = await fetch("/api/fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Fit request failed");
      setState({
        kind: "result",
        data: json as FitResponse,
        developers: devsJson.developers,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void runFit(repoUrl);
  }

  return (
    <div>
      {!hasGeminiKey && (
        <div className="mb-6 flex gap-3 rounded-xl border border-warn-line bg-warn-bg p-4 text-sm">
          <span aria-hidden className="mt-0.5 shrink-0 text-warn-fg">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </span>
          <div>
            <div className="font-bold text-warn-fg">No Gemini key configured</div>
            <p className="mt-1 text-body">
              Analysis needs a Gemini API key.{" "}
              <Link
                href="/settings"
                className="font-semibold text-accent-soft-fg underline underline-offset-2 hover:text-accent"
              >
                Add yours in Settings
              </Link>
              {serverKeyAllowed ? (
                <>
                  {" "}
                  — or set <code>GEMINI_API_KEY</code> on the server.
                </>
              ) : (
                "."
              )}
            </p>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-soft-fg">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
          Deterministic scoring
        </span>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
          Check fit for a repo
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-body">
          Paste a public GitHub repo URL. DevFit builds a digest, asks Gemini what
          kind of developer it needs, and ranks the seeded team against it.
          Scoring is deterministic — the AI narrates, it doesn&rsquo;t re-rank.
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            type="url"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-heading placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
            required
          />
          <button
            type="submit"
            disabled={state.kind === "loading"}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-contrast shadow-brand transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
          >
            {state.kind === "loading" ? "Working…" : "Analyse & rank"}
          </button>
        </form>

        {repoUrl && !urlValid && (
          <p className="mt-2 text-xs font-medium text-danger-fg">
            Doesn&rsquo;t look like a GitHub repo URL yet.
          </p>
        )}

        <RepoPicker onSelect={setRepoUrl} disabled={state.kind === "loading"} />
      </section>

      {state.kind === "loading" && (
        <FullScreenLoader
          message={state.message}
          hint="Fetching the repo tree and up to 20 key files, then two Gemini calls. Usually 5–30 seconds."
        />
      )}

      {state.kind === "error" && (
        <div className="mt-6 rounded-xl border border-danger-line bg-danger-bg p-4 text-sm">
          <div className="font-bold text-danger-fg">Something went wrong</div>
          <div className="mt-1 whitespace-pre-wrap text-danger-fg">
            {state.message}
          </div>
          <div className="mt-2 text-xs text-body">
            Common causes: missing <code>GEMINI_API_KEY</code>, GitHub rate-limit
            hit (add <code>GITHUB_TOKEN</code>), or a private/deleted repo.
          </div>
        </div>
      )}

      {state.kind === "result" && (
        <FitResultView data={state.data} developers={state.developers} />
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div className="mt-1.5 text-sm text-heading">{children}</div>
    </div>
  );
}

function FitResultView({
  data,
  developers,
}: {
  data: FitResponse;
  developers: DeveloperView[];
}) {
  const devById = new Map(developers.map((d) => [d.id, d]));
  const topPick = data.ranked.find((r) => r.devId === data.topPickId);

  return (
    <>
      <section className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold text-heading">Repo requirement</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-body">
          {data.requirement.summary}
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Domain">{data.requirement.domain}</Field>
          <Field label="Complexity · Archetype needed">
            <span className="capitalize">{data.requirement.complexity}</span> ·{" "}
            <span className="capitalize">
              {data.requirement.primaryArchetypeNeeded}
            </span>
          </Field>
          <Field label="Languages">
            <div className="flex flex-wrap gap-1.5">
              {data.requirement.languages.map((l) => (
                <StackTag key={l}>{l}</StackTag>
              ))}
            </div>
          </Field>
          <Field label="Stack">
            <div className="flex flex-wrap gap-1.5">
              {data.requirement.stack.length === 0 && (
                <span className="text-xs text-muted">(none detected)</span>
              )}
              {data.requirement.stack.map((s) => (
                <StackTag key={s}>{s}</StackTag>
              ))}
            </div>
          </Field>
        </div>
      </section>

      {topPick && (
        <section className="relative mt-6 overflow-hidden rounded-2xl border border-accent-line bg-accent-soft p-6 shadow-card">
          {/* Accent rail rather than a 2px ring: it marks the winner without
              boxing the card in a heavy outline. */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-1 bg-accent"
          />
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-accent-soft-fg">
            <span className="inline-block h-2 w-2 rounded-full bg-accent" />
            Fittest for this repo
          </div>
          <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <Link
                href={`/developer/${topPick.devId}`}
                className="text-2xl font-extrabold tracking-tight text-heading underline-offset-4 hover:underline"
              >
                {devById.get(topPick.devId)?.name ?? topPick.devId}
              </Link>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-body">
                {data.topPickRationale}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-4xl font-extrabold tabular-nums text-accent-soft-fg">
                {topPick.overall.toFixed(1)}
              </div>
              <div className="mt-1.5">
                <VerdictBadge verdict={topPick.verdict} />
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-heading">
          Full ranking ({data.ranked.length})
        </h2>
        {data.ranked.map((score, idx) => {
          const dev = devById.get(score.devId);
          if (!dev) return null;
          const highlight = score.devId === data.topPickId;
          return (
            <article
              key={score.devId}
              className={`rounded-2xl border bg-surface p-5 shadow-card transition ${
                highlight ? "border-accent-line" : "border-line"
              }`}
            >
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-[11px] font-bold ${
                        idx === 0
                          ? "bg-accent text-accent-contrast"
                          : "bg-surface-2 text-muted"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <Link
                      href={`/developer/${dev.id}`}
                      className="text-base font-bold text-heading underline-offset-4 hover:text-accent-soft-fg hover:underline"
                    >
                      {dev.name}
                    </Link>
                    <ArchetypeBadge archetype={dev.archetype} />
                    <VerdictBadge verdict={score.verdict} />
                    {dev.aiFluency && <AiFluencyBadge fluency={dev.aiFluency} />}
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-body">
                    {score.explanation}
                  </p>
                </div>
                <div className="w-full max-w-sm space-y-2.5 rounded-xl bg-surface-2 p-4 md:w-72">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                      Overall
                    </span>
                    <span className="text-2xl font-extrabold tabular-nums text-heading">
                      {score.overall.toFixed(1)}
                    </span>
                  </div>
                  <SubScoreBar label="Languages" value={score.languageOverlap} />
                  <SubScoreBar label="Frameworks" value={score.frameworkOverlap} />
                  <SubScoreBar
                    label="Archetype match"
                    value={score.archetypeMatch}
                  />
                  <SubScoreBar
                    label="Experience depth"
                    value={score.experienceDepth}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <div className="mt-8 rounded-xl border border-line bg-surface-2 p-4 text-xs leading-relaxed text-body">
        <span className="font-bold text-heading">Note:</span> DevFit is decision
        support for a human — commit counts and language overlap are proxies for
        skill, not proof of it. Use the ranking as one input to a reassignment
        conversation, not the answer.
      </div>
    </>
  );
}
