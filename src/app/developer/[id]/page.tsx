import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchetypeBadge } from "@/components/ArchetypeBadge";
import { getDeveloperById, getAllDevelopers } from "@/lib/developerHelpers";

export function generateStaticParams() {
  return getAllDevelopers().map((d) => ({ id: d.id }));
}

export default async function DeveloperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dev = getDeveloperById(id);
  if (!dev) return notFound();
  const net = dev.linesAdded - dev.linesDeleted;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-ink-600 hover:text-ink-900"
        >
          ← All developers
        </Link>
      </div>

      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-ink-200 bg-white p-6 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            {dev.name}
          </h1>
          <div className="mt-2">
            <ArchetypeBadge archetype={dev.archetype} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {dev.languages.map((lang) => (
              <span
                key={lang}
                className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
        <Link
          href="/fit"
          className="inline-flex w-max items-center rounded-md bg-pine-600 px-4 py-2 text-sm font-medium text-white hover:bg-pine-700"
        >
          Check fit for a repo →
        </Link>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-ink-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-ink-400">
            Total commits
          </div>
          <div className="mt-1 text-2xl font-semibold text-ink-900">
            {dev.totalCommits.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-ink-400">
            Lines added
          </div>
          <div className="mt-1 text-2xl font-semibold text-ink-900">
            {dev.linesAdded.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-ink-400">
            Net lines
          </div>
          <div className="mt-1 text-2xl font-semibold text-ink-900">
            +{net.toLocaleString()}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink-900">Repositories</h2>
        <div className="mt-3 divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
          {dev.repos.map((r) => (
            <div
              key={r.name}
              className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="font-medium text-ink-900">{r.name}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.languages.map((l) => (
                    <span
                      key={l}
                      className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-600"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-xs text-ink-600 md:text-right">
                <div>
                  <div className="text-ink-400">Commits</div>
                  <div className="font-semibold text-ink-800">
                    {r.commits.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-ink-400">Added</div>
                  <div className="font-semibold text-ink-800">
                    +{r.additions.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-ink-400">Deleted</div>
                  <div className="font-semibold text-ink-800">
                    −{r.deletions.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink-900">
          Recent commit messages
        </h2>
        <ul className="mt-3 divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white text-sm">
          {dev.recentCommitMessages.map((m, i) => (
            <li key={i} className="p-3 font-mono text-ink-800">
              {m}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
