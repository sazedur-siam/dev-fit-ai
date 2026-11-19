import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AiFluencyCard } from "@/components/AiFluencyCard";
import { ArchetypeBadge, StackTag } from "@/components/ArchetypeBadge";
import { ContributionHeatmap } from "@/components/ContributionHeatmap";
import { ProfileActions } from "@/components/ProfileActions";
import { getDeveloperById } from "@/lib/db/developers";
import { getProfileReport } from "@/lib/db/profileReports";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString();

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-1 text-xl font-extrabold tabular-nums text-heading">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{title}</h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-body">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

function TagRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((s) => (
          <StackTag key={s}>{s}</StackTag>
        ))}
      </div>
    </div>
  );
}

export default async function ProfileReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  // Scoped to this user: someone else's report id is a 404.
  const report = await getProfileReport(user.id, id);
  if (!report) return notFound();
  const { developer: dev, insights: p, summary } = report;
  const inPool = Boolean(await getDeveloperById(dev.id));
  const details = new Map(p.repoDetails.map((r) => [r.name, r]));
  const a = p.activity;

  return (
    <div>
      <div className="mb-5">
        <Link
          href="/profiles"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-heading"
        >
          <span aria-hidden>←</span> All reports
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col justify-between gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7 md:flex-row md:items-start">
        <div className="flex min-w-0 gap-4">
          {p.avatarUrl && (
            <Image
              src={p.avatarUrl}
              alt=""
              width={72}
              height={72}
              className="h-[72px] w-[72px] shrink-0 rounded-full ring-1 ring-line"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
              {p.name ?? p.login}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-body underline underline-offset-4 hover:text-heading"
              >
                @{p.login}
              </a>
              {!report.developerError && (
                <>
                  <ArchetypeBadge archetype={dev.archetype} />
                  <span className="text-[11px] text-muted">guessed from language bytes</span>
                </>
              )}
            </div>
            {p.bio && <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-body">{p.bio}</p>}
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {p.company && <span>{p.company}</span>}
              {p.location && <span>{p.location}</span>}
              {p.websiteUrl && (
                <a
                  href={p.websiteUrl}
                  target="_blank"
                  rel="noreferrer nofollow"
                  className="underline underline-offset-4 hover:text-heading"
                >
                  {p.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              )}
              {p.twitter && <span>X: @{p.twitter}</span>}
              <span>
                On GitHub since {p.createdAt.slice(0, 10)} ({p.accountAgeYears} yrs)
              </span>
            </div>
            {p.organizations.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {p.organizations.map((o) => (
                  <a key={o.login} href={o.url} target="_blank" rel="noreferrer">
                    <StackTag>{o.name ?? o.login}</StackTag>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
        <ProfileActions
          reportId={report.id}
          login={report.login}
          developerId={dev.id}
          inPool={inPool}
          canPool={dev.repos.length > 0}
          poolBlockedReason={
            report.developerError
              ? "Commit data is missing from this report. Re-analyze to try again."
              : "No commits by them in their own public repositories, so there's nothing to score."
          }
        />
      </div>

      {report.developerError && (
        <p className="mt-4 rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn-fg">
          <strong>Partial report.</strong> {report.developerError} Profile, activity and open-source sections below
          are complete; commits, stack, AI fluency and repository stats are missing. Re-analyze later to fill them
          in.
        </p>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Followers" value={n(p.followers)} hint={`following ${n(p.following)}`} />
        <Stat label="Public repos" value={n(p.publicRepos)} hint="own, not forks" />
        <Stat label="Stars earned" value={n(p.starsEarned)} hint={`${n(p.forksEarned)} forks`} />
        <Stat
          label="Commits"
          value={report.developerError ? "—" : n(dev.totalCommits)}
          hint={report.developerError ? "not fetched" : "in their most recent 15 repos"}
        />
      </section>

      {/* AI summary */}
      <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-heading">Summary</h2>
          <span className="text-[11px] text-muted">
            Written by AI from the data on this page. Verify before deciding.
          </span>
        </div>
        {summary ? (
          <div className="mt-3 space-y-4">
            <p className="text-base font-semibold leading-relaxed text-heading">{summary.headline}</p>
            {summary.likelyRoles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {summary.likelyRoles.map((r) => (
                  <StackTag key={r}>{r}</StackTag>
                ))}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <Bullets title="Strengths" items={summary.strengths} />
              <Bullets title="Ask in an interview" items={summary.verifyInInterview} />
            </div>
            {summary.seniorityNotes && (
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                  Experience signals
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-body">{summary.seniorityNotes}</p>
              </div>
            )}
            <Bullets title="Caveats" items={summary.caveats} />
          </div>
        ) : report.summaryError ? (
          <p className="mt-2 text-sm text-muted">
            The AI summary failed ({report.summaryError}). Re-analyze to try again.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            No AI summary: add a key in{" "}
            <Link href="/settings" className="underline underline-offset-4">
              Settings
            </Link>{" "}
            and re-analyze.
          </p>
        )}
      </section>

      {/* Activity */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-heading">Last 12 months</h2>
        <p className="mt-1 text-xs text-muted">
          GitHub&rsquo;s contribution calendar. It counts public activity, plus private activity only if the
          developer has chosen to show it.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Contributions"
            value={n(a.totalContributions)}
            hint={a.privateContributions ? `incl. ${n(a.privateContributions)} private` : undefined}
          />
          <Stat label="Commits" value={n(a.commits)} />
          <Stat label="Pull requests" value={n(a.pullRequests)} />
          <Stat label="Code reviews" value={n(a.reviews)} />
          <Stat label="Issues" value={n(a.issues)} />
          <Stat
            label="Active days"
            value={n(a.activeDays)}
            hint={a.busiestWeekday ? `busiest on ${a.busiestWeekday}s` : undefined}
          />
          <Stat label="Longest streak" value={`${n(a.longestStreak)} d`} />
          <Stat label="Current streak" value={`${n(a.currentStreak)} d`} />
        </div>
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
          <ContributionHeatmap days={a.calendar} />
        </div>
      </section>

      {/* Stack */}
      <section className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="text-sm font-bold text-heading">Stack</h2>
        <p className="mt-1 text-xs text-muted">
          Languages from repository bytes; frameworks from dependency files (package.json, requirements.txt,
          composer.json and others) in their most active repositories.
        </p>
        {dev.languages.length + dev.frameworks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing detected in their own public repositories.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <TagRow label="Languages" items={dev.languages} />
            <TagRow label="Frameworks" items={dev.frameworks} />
          </div>
        )}
      </section>

      <AiFluencyCard
        fluency={dev.aiFluency}
        notMeasuredHint="Not measured: none of their own public repositories had commits by them to check."
      />

      {/* Repositories */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-heading">Most active repositories</h2>
        <p className="mt-1 text-xs text-muted">
          Their own public repositories (not forks), ranked by commits they wrote. Line counts are estimated from
          recent commits.
        </p>
        {dev.repos.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No commits by them in their own public repositories.</p>
        ) : (
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {dev.repos.map((r) => {
              const d = details.get(r.name);
              const stats: [string, string, string][] = [
                ["Stars", n(d?.stars ?? 0), "text-heading"],
                ["Commits", n(r.commits), "text-heading"],
                ["Added", `+${n(r.additions)}`, "text-ok-fg"],
                ["Deleted", `−${n(r.deletions)}`, "text-danger-fg"],
              ];
              return (
                <div
                  key={r.name}
                  className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {d ? (
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-heading underline-offset-4 hover:underline"
                        >
                          {r.name}
                        </a>
                      ) : (
                        <span className="font-semibold text-heading">{r.name}</span>
                      )}
                      {d?.isArchived && <span className="text-[11px] font-semibold text-warn-fg">archived</span>}
                      {d?.license && <span className="text-[11px] text-muted">{d.license}</span>}
                    </div>
                    {d?.description && <p className="mt-1 text-sm text-body">{d.description}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {[...(r.frameworks ?? []), ...r.languages].map((l) => (
                        <StackTag key={l}>{l}</StackTag>
                      ))}
                      {d?.topics.map((t) => (
                        <span key={`t-${t}`} className="text-[11px] text-muted">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid shrink-0 grid-cols-4 gap-4 text-xs md:text-right">
                    {stats.map(([label, value, cls]) => (
                      <div key={label}>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</div>
                        <div className={`mt-0.5 font-bold tabular-nums ${cls}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {p.pinned.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-heading">Pinned</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {p.pinned.map((r) => (
              <li key={r.nameWithOwner}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-full rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-accent-line hover:shadow-card-hover"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-heading">{r.nameWithOwner}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">★ {n(r.stars)}</span>
                  </div>
                  {r.description && <p className="mt-1 line-clamp-2 text-xs text-body">{r.description}</p>}
                  {r.language && (
                    <div className="mt-2">
                      <StackTag>{r.language}</StackTag>
                    </div>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Open source */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-heading">Contributions to other projects</h2>
        <p className="mt-1 text-xs text-muted">
          Merged pull requests to public repositories they don&rsquo;t own, among their{" "}
          {p.openSource.sampled} most recent merged pull requests.
        </p>
        {p.openSource.repos.length === 0 ? (
          <p className="mt-3 text-sm text-muted">None among those.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {p.openSource.repos.map((o) => (
              <li key={o.repo} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-heading underline-offset-4 hover:underline"
                  >
                    {o.repo}
                  </a>
                  <p className="mt-0.5 truncate text-xs text-muted">e.g. &ldquo;{o.example}&rdquo;</p>
                </div>
                <div className="flex shrink-0 gap-4 text-xs tabular-nums text-muted">
                  <span>★ {n(o.stars)}</span>
                  <span className="font-semibold text-heading">{o.mergedCount} merged</span>
                  {o.lastMergedAt && <span>{o.lastMergedAt.slice(0, 10)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dev.recentCommitMessages.length > 0 && (
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
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted">
        Analyzed {report.updatedAt.slice(0, 10)} from <strong>public</strong> GitHub activity only. Work under
        another account, private repositories and code outside GitHub don&rsquo;t show up. Commits and stars
        hint at skill but don&rsquo;t prove it; use this report to prepare for a conversation, not to replace one.
      </p>
    </div>
  );
}
