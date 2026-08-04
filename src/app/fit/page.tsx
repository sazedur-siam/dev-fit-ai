"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArchetypeBadge } from "@/components/ArchetypeBadge";
import { VerdictBadge } from "@/components/VerdictBadge";
import { SubScoreBar } from "@/components/SubScoreBar";
import { FullScreenLoader } from "@/components/FullScreenLoader";
import { RepoPicker } from "@/components/RepoPicker";
import type { DeveloperView, FitScore, RepoRequirement } from "@/lib/types";

interface FitResponse {
  requirement: RepoRequirement;
  ranked: FitScore[];
  topPickId: string;
  topPickRationale: string;
}

function isValidRepoUrl(input: string): boolean {
  return /^(?:https?:\/\/)?(?:www\.)?github\.com\/[^/\s]+\/[^/\s#?]+/i.test(
    input.trim()
  );
}

export default function FitPage() {
  const [repoUrl, setRepoUrl] = useState("");
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
      <section className="rounded-2xl border border-ink-200 bg-white p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Check fit for a repo
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          Paste a public GitHub repo URL. DevFit builds a digest, asks Gemini
          what kind of developer it needs, and ranks the seeded team against
          it. Scoring is deterministic — the AI narrates, it doesn&rsquo;t re-rank.
        </p>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="url"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="flex-1 rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
            required
          />
          <button
            type="submit"
            disabled={state.kind === "loading"}
            className="inline-flex items-center justify-center rounded-md bg-pine-600 px-4 py-2 text-sm font-medium text-white hover:bg-pine-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.kind === "loading" ? "Working…" : "Analyse & rank"}
          </button>
        </form>

        {repoUrl && !urlValid && (
          <p className="mt-2 text-xs text-brick-600">
            Doesn&rsquo;t look like a GitHub repo URL yet.
          </p>
        )}

        <RepoPicker
          onSelect={setRepoUrl}
          disabled={state.kind === "loading"}
        />
      </section>

      {state.kind === "loading" && (
        <FullScreenLoader
          message={state.message}
          hint="Fetching the repo tree and up to 20 key files, then two Gemini calls. Usually 5–30 seconds."
        />
      )}

      {state.kind === "error" && (
        <div className="mt-6 rounded-xl border border-brick-500/30 bg-brick-50 p-4 text-sm text-brick-600">
          <div className="font-semibold">Something went wrong</div>
          <div className="mt-1 whitespace-pre-wrap">{state.message}</div>
          <div className="mt-2 text-xs text-ink-600">
            Common causes: missing <code>GEMINI_API_KEY</code>, GitHub
            rate-limit hit (add <code>GITHUB_TOKEN</code>), or a private/deleted
            repo.
          </div>
        </div>
      )}

      {state.kind === "result" && (
        <FitResultView
          data={state.data}
          developers={state.developers}
        />
      )}
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
      <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">
          Repo requirement
        </h2>
        <p className="mt-1 text-sm text-ink-600">{data.requirement.summary}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-400">
              Domain
            </div>
            <div className="mt-1 text-sm text-ink-900">
              {data.requirement.domain}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-400">
              Complexity · Archetype needed
            </div>
            <div className="mt-1 text-sm text-ink-900">
              <span className="capitalize">{data.requirement.complexity}</span> ·{" "}
              <span className="capitalize">
                {data.requirement.primaryArchetypeNeeded}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-400">
              Languages
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {data.requirement.languages.map((l) => (
                <span
                  key={l}
                  className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-600"
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-400">
              Stack
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {data.requirement.stack.length === 0 && (
                <span className="text-xs text-ink-400">
                  (none detected)
                </span>
              )}
              {data.requirement.stack.map((s) => (
                <span
                  key={s}
                  className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-600"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {topPick && (
        <section className="mt-6 rounded-2xl border-2 border-pine-500/30 bg-pine-50 p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-pine-700">
            <span className="inline-block h-2 w-2 rounded-full bg-pine-500" />
            Fittest for this repo
          </div>
          <div className="mt-2 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <Link
                href={`/developer/${topPick.devId}`}
                className="text-2xl font-semibold text-ink-900 hover:text-pine-700"
              >
                {devById.get(topPick.devId)?.name ?? topPick.devId}
              </Link>
              <p className="mt-1 max-w-2xl text-sm text-ink-700">
                {data.topPickRationale}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-pine-700">
                {topPick.overall.toFixed(1)}
              </div>
              <div className="mt-1">
                <VerdictBadge verdict={topPick.verdict} />
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-ink-900">
          Full ranking ({data.ranked.length})
        </h2>
        {data.ranked.map((score, idx) => {
          const dev = devById.get(score.devId);
          if (!dev) return null;
          const highlight = score.devId === data.topPickId;
          return (
            <article
              key={score.devId}
              className={`rounded-xl border p-5 ${
                highlight
                  ? "border-pine-500/40 bg-white"
                  : "border-ink-200 bg-white"
              }`}
            >
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-ink-400">
                      #{idx + 1}
                    </span>
                    <Link
                      href={`/developer/${dev.id}`}
                      className="text-base font-semibold text-ink-900 hover:text-pine-700"
                    >
                      {dev.name}
                    </Link>
                    <ArchetypeBadge archetype={dev.archetype} />
                    <VerdictBadge verdict={score.verdict} />
                  </div>
                  <p className="mt-2 text-sm text-ink-700">
                    {score.explanation}
                  </p>
                </div>
                <div className="w-full max-w-sm space-y-2 md:w-72">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wide text-ink-400">
                      Overall
                    </span>
                    <span className="text-2xl font-bold text-ink-900">
                      {score.overall.toFixed(1)}
                    </span>
                  </div>
                  <SubScoreBar
                    label="Stack overlap"
                    value={score.stackOverlap}
                    tone="pine"
                  />
                  <SubScoreBar
                    label="Archetype match"
                    value={score.archetypeMatch}
                    tone="pine"
                  />
                  <SubScoreBar
                    label="Experience depth"
                    value={score.experienceDepth}
                    tone="pine"
                  />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <div className="mt-8 rounded-lg border border-ink-200 bg-white p-4 text-xs text-ink-600">
        <span className="font-semibold text-ink-800">Note:</span> DevFit is
        decision support for a human — commit counts and language overlap are
        proxies for skill, not proof of it. Use the ranking as one input to a
        reassignment conversation, not the answer.
      </div>
    </>
  );
}
