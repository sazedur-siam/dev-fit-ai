import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { ArchetypeBadge, StackTag } from "@/components/ArchetypeBadge";
import { getDeveloperById } from "@/lib/db/developers";
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
  const dev = await getDeveloperById(id);
  if (!dev) return notFound();
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
          <div className="mt-2.5">
            <ArchetypeBadge archetype={dev.archetype} />
          </div>
          <SkillRow label="Languages" items={dev.languages} />
          <SkillRow label="Frameworks" items={dev.frameworks} />
        </div>
        <Link
          href="/fit"
          className="inline-flex w-max shrink-0 items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-contrast shadow-brand transition hover:bg-accent-hover"
        >
          Check fit for a repo
          <span aria-hidden>→</span>
        </Link>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total commits" value={dev.totalCommits.toLocaleString()} />
        <Stat label="Lines added" value={dev.linesAdded.toLocaleString()} />
        <Stat label="Net lines" value={`+${net.toLocaleString()}`} />
      </section>

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
