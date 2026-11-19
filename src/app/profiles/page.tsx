import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArchetypeBadge } from "@/components/ArchetypeBadge";
import { ProfileAnalyzerForm } from "@/components/ProfileAnalyzerForm";
import { resolveCredentials } from "@/lib/credentials";
import { getAllDevelopers } from "@/lib/db/developers";
import { listProfileReports } from "@/lib/db/profileReports";
import { githubDeveloperId } from "@/lib/githubProfile";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GitHub Profile Analyzer: analyze an account, and your saved reports. */
export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ login?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // `?login=` pre-fills the form (from a developer page). Input text only; the
  // API validates it like anything typed.
  const { login } = await searchParams;
  const initialLogin = typeof login === "string" ? login.slice(0, 200) : "";

  const [reports, developers, creds] = await Promise.all([
    listProfileReports(user.id),
    getAllDevelopers(),
    resolveCredentials(user),
  ]);
  const pool = new Set(developers.map((d) => d.id));

  return (
    <div>
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
        <h1 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
          GitHub Profile Analyzer
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-body">
          Paste a developer&rsquo;s GitHub username or profile link to see their stack, activity,
          top repositories and open-source work in one report. Reports are private to you; add
          someone to the developer pool to shortlist them and include them in fit rankings.
        </p>
        {creds.githubSource === "none" && (
          <p className="mt-3 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            Analyzing needs a GitHub token.{" "}
            <Link href="/settings" className="font-semibold underline underline-offset-4">
              Add one in Settings
            </Link>
            .
          </p>
        )}
        {creds.githubSource !== "none" && creds.llmSource === "none" && (
          <p className="mt-3 text-xs text-muted">
            No AI model key, so reports won&rsquo;t include the AI summary.{" "}
            <Link href="/settings" className="font-semibold underline underline-offset-4">
              Add one in Settings
            </Link>
            .
          </p>
        )}
        <ProfileAnalyzerForm initialLogin={initialLogin} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-heading">Your reports</h2>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No reports yet. Analyze a profile above.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/profiles/${r.id}`}
                  className="flex items-center gap-3 p-4 transition hover:bg-surface-2"
                >
                  {r.avatarUrl ? (
                    <Image
                      src={r.avatarUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 shrink-0 rounded-full ring-1 ring-line"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-full bg-surface-2 ring-1 ring-line" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-heading">{r.name}</span>
                      <span className="text-xs text-muted">@{r.login}</span>
                      <ArchetypeBadge archetype={r.archetype} />
                      {pool.has(githubDeveloperId(r.login)) && (
                        <span className="inline-flex items-center rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-soft-fg ring-1 ring-inset ring-accent-line">
                          In pool
                        </span>
                      )}
                    </div>
                    {r.headline && <p className="mt-0.5 truncate text-xs text-muted">{r.headline}</p>}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{r.updatedAt.slice(0, 10)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
