import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listUserAnalyses } from "@/lib/db/analyses";
import { VerdictBadge } from "@/components/VerdictBadge";
import { SCORING_VERSION } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const analyses = await listUserAnalyses(user.id);

  return (
    <div>
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
        <h1 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
          Your analysis history
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-body">
          Every fit run you&rsquo;ve done, newest first. Only you can see these.
        </p>
      </section>

      {analyses.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line-strong bg-surface p-12 text-center">
          <p className="text-sm font-bold text-heading">Nothing here yet</p>
          <p className="mt-1.5 text-xs text-muted">
            Run an analysis and it will show up here.
          </p>
          <Link
            href="/fit"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-accent-contrast transition hover:bg-accent-hover"
          >
            Check fit for a repo <span aria-hidden>→</span>
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {analyses.map((a) => {
            const top = a.ranked.find((r) => r.devId === a.topPickId) ?? a.ranked[0];
            const outdated = a.scoringVersion !== SCORING_VERSION;
            return (
              <li
                key={a.id}
                className="rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:border-accent-line hover:shadow-card-hover"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <a
                      href={a.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-heading underline-offset-4 hover:text-accent-soft-fg hover:underline"
                    >
                      {a.owner}/{a.repo}
                    </a>
                    <p className="mt-1.5 line-clamp-2 max-w-2xl text-xs leading-relaxed text-body">
                      {a.requirement.summary}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Meta>{a.requirement.primaryArchetypeNeeded}</Meta>
                      <Meta>{a.requirement.complexity} complexity</Meta>
                      <Meta>{a.createdAt.slice(0, 10)}</Meta>
                    </div>
                    {outdated && (
                      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-warn-fg">
                        <span>
                          Scored with an older formula
                          {a.scoringVersion === "0" ? "" : ` (v${a.scoringVersion})`}. The
                          numbers may differ today.
                        </span>
                        <Link
                          href={`/fit?repo=${encodeURIComponent(a.repoUrl)}`}
                          className="font-bold underline underline-offset-4 hover:text-heading"
                        >
                          Re-run with v{SCORING_VERSION}
                        </Link>
                      </p>
                    )}
                  </div>

                  {top && (
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                        Top pick
                      </div>
                      <Link
                        href={`/developer/${top.devId}`}
                        className="text-sm font-semibold text-heading underline-offset-4 hover:text-accent-soft-fg hover:underline"
                      >
                        {top.devId}
                      </Link>
                      <div className="mt-1.5 flex items-center justify-end gap-2">
                        <span className="text-xl font-extrabold tabular-nums text-accent-soft-fg">
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
    <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-medium capitalize text-body ring-1 ring-inset ring-line">
      {children}
    </span>
  );
}
