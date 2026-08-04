import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listUserAnalyses } from "@/lib/db/analyses";
import { VerdictBadge } from "@/components/VerdictBadge";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const analyses = await listUserAnalyses(user.id);

  return (
    <div>
      <section className="rounded-2xl border border-ink-200 bg-white p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Your analysis history
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          Every fit run you&rsquo;ve done, newest first. Only you can see these.
        </p>
      </section>

      {analyses.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-ink-200 bg-white p-10 text-center">
          <p className="text-sm font-medium text-ink-800">Nothing here yet</p>
          <p className="mt-1 text-xs text-ink-400">
            Run an analysis and it will show up here.
          </p>
          <Link
            href="/fit"
            className="mt-4 inline-flex rounded-md bg-pine-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pine-700"
          >
            Check fit for a repo →
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {analyses.map((a) => {
            const top = a.ranked.find((r) => r.devId === a.topPickId) ?? a.ranked[0];
            return (
              <li
                key={a.id}
                className="rounded-xl border border-ink-200 bg-white p-5"
              >
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <a
                      href={a.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-ink-900 hover:text-pine-700"
                    >
                      {a.owner}/{a.repo}
                    </a>
                    <p className="mt-1 line-clamp-2 max-w-2xl text-xs text-ink-600">
                      {a.requirement.summary}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Meta>{a.requirement.primaryArchetypeNeeded}</Meta>
                      <Meta>{a.requirement.complexity} complexity</Meta>
                      <Meta>{a.createdAt.slice(0, 10)}</Meta>
                    </div>
                  </div>

                  {top && (
                    <div className="shrink-0 text-right">
                      <div className="text-xs uppercase tracking-wide text-ink-400">
                        Top pick
                      </div>
                      <Link
                        href={`/developer/${top.devId}`}
                        className="text-sm font-medium text-ink-900 hover:text-pine-700"
                      >
                        {top.devId}
                      </Link>
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <span className="text-lg font-bold text-pine-700">
                          {top.overall.toFixed(1)}
                        </span>
                        <VerdictBadge verdict={top.verdict} />
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium capitalize text-ink-600">
      {children}
    </span>
  );
}
