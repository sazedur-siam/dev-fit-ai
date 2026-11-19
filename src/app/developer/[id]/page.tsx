import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { AiFluencyCard } from "@/components/AiFluencyCard";
import {
  ArchetypeBadge,
  SourceBadge,
  StackTag,
} from "@/components/ArchetypeBadge";
import { getAllDevelopers } from "@/lib/db/developers";
import { similarDevelopers } from "@/lib/similarity";
import { listNotes } from "@/lib/db/notes";
import { listTags } from "@/lib/db/tags";
import { listShortlists } from "@/lib/db/shortlists";
import { DeveloperWorkspace } from "@/components/DeveloperWorkspace";
import { getCurrentUser } from "@/lib/session";

/**
 * `generateStaticParams` was removed when the cohort moved to MongoDB:
 * prerendering would have required a database connection at build time, and the
 * cohort is now editable at runtime, so a build-time snapshot would go stale.
 */
export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-heading">
        {value}
      </div>
    </div>
  );
}

export default async function DeveloperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  // The whole cohort is needed for "similar developers"; it's small (tens).
  const cohort = await getAllDevelopers();
  const dev = cohort.find((d) => d.id === id);
  if (!dev) return notFound();
  const similar = similarDevelopers(dev, cohort, 3);
  // The signed-in user's own workspace only; never anyone else's.
  const [notes, tags, shortlists] = await Promise.all([
    listNotes(user.id, dev.id),
    listTags(user.id, dev.id),
    listShortlists(user.id),
  ]);
  const net = dev.linesAdded - dev.linesDeleted;

  return (
    <div>
      <div className="mb-5">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-heading"
        >
          <span aria-hidden>←</span> All developers
        </Link>
      </div>

      <div className="flex flex-col justify-between gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
            {dev.name}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <ArchetypeBadge archetype={dev.archetype} />
            <SourceBadge source={dev.source ?? "seed"} />
          </div>
          <p className="mt-2.5 max-w-xl text-xs leading-relaxed text-muted">
            {dev.source === "github" && dev.githubLogin ? (
              <>
                Built from{" "}
                <a
                  href={`https://github.com/${dev.githubLogin}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-body underline underline-offset-4 hover:text-heading"
                >
                  @{dev.githubLogin}
                </a>
                &rsquo;s <strong>public</strong> GitHub activity
                {dev.importedAt ? ` on ${dev.importedAt.slice(0, 10)}` : ""}. Private work
                isn&rsquo;t visible, and line counts are estimated from recent commits.
              </>
            ) : (
              <>Sample developer: invented data for demonstrating DevFit.</>
            )}
          </p>
          <SkillRow label="Languages" items={dev.languages} />
          <SkillRow label="Frameworks" items={dev.frameworks} />
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Link
            href="/fit"
            className="inline-flex w-max items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-contrast shadow-brand transition hover:bg-accent-hover"
          >
            Check fit for a repo
            <span aria-hidden>→</span>
          </Link>
          {dev.source === "github" && dev.githubLogin && (
            <Link
              href={`/profiles?login=${encodeURIComponent(dev.githubLogin)}`}
              className="inline-flex w-max items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-body transition hover:border-line-strong hover:text-heading"
            >
              Full GitHub analysis
            </Link>
          )}
        </div>
      </div>

      {dev.source === "github" && (
        <AiFluencyCard
          fluency={dev.aiFluency}
          notMeasuredHint="Not measured yet. Imported before AI-tool detection existed; re-import from the admin page or wait for the nightly refresh."
        />
      )}

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total commits" value={dev.totalCommits.toLocaleString()} />
        <Stat label="Lines added" value={dev.linesAdded.toLocaleString()} />
        <Stat label="Net lines" value={`+${net.toLocaleString()}`} />
      </section>

      <DeveloperWorkspace
        developerId={dev.id}
        initialNotes={notes}
        initialTags={tags}
        initialShortlists={shortlists}
      />

      {similar.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-heading">Similar developers</h2>
          <p className="mt-1 text-xs text-muted">
            By overlap in languages and frameworks, weighted by commits. For finding a
            backup or a pair; it plays no part in any fit score.
          </p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {similar.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/developer/${s.id}`}
                  className="block h-full rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-accent-line hover:shadow-card-hover"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-heading">{s.name}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-accent-soft-fg">
                      {Math.round(s.similarity * 100)}%
                    </span>
                  </div>
                  {s.shared.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.shared.slice(0, 4).map((k) => (
                        <StackTag key={k}>{k}</StackTag>
                      ))}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold text-heading">Repositories</h2>
        <div className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {dev.repos.map((r) => (
            <div
              key={r.name}
              className="flex flex-col gap-3 p-4 transition hover:bg-surface-2 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="font-semibold text-heading">{r.name}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[...(r.frameworks ?? []), ...r.languages].map((l) => (
                    <StackTag key={l}>{l}</StackTag>
                  ))}
                </div>
              </div>
              <div className="grid shrink-0 grid-cols-3 gap-5 text-xs md:text-right">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Commits
                  </div>
                  <div className="mt-0.5 font-bold tabular-nums text-heading">
                    {r.commits.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Added
                  </div>
                  <div className="mt-0.5 font-bold tabular-nums text-ok-fg">
                    +{r.additions.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Deleted
                  </div>
                  <div className="mt-0.5 font-bold tabular-nums text-danger-fg">
                    −{r.deletions.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-heading">Recent commit messages</h2>
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-sm shadow-card">
          {dev.recentCommitMessages.map((m, i) => (
            <li key={i} className="flex gap-2.5 p-3.5 font-mono text-xs text-body">
              <span aria-hidden className="select-none text-accent">
                ›
              </span>
              {m}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SkillRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <StackTag key={item}>{item}</StackTag>
        ))}
      </div>
    </div>
  );
}
