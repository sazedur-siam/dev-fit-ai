import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listUsers } from "@/lib/db/users";
import { getKeyPresenceByUser } from "@/lib/db/keys";
import { getAllDevelopers } from "@/lib/db/developers";
import { getLastRefreshRun } from "@/lib/db/refreshRuns";
import { AdminUserTable, type AdminUserRow } from "@/components/AdminUserTable";
import { AdminDevelopers, type AdminDeveloperRow } from "@/components/AdminDevelopers";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Authoritative check against MongoDB, not the JWT claim.
  if (user.role !== "admin") redirect("/");

  const [users, presence, developers, lastRefresh] = await Promise.all([
    listUsers(),
    getKeyPresenceByUser(),
    getAllDevelopers(),
    getLastRefreshRun().catch(() => null),
  ]);
  const developerCount = developers.length;

  // Real developers first, newest import first; samples after, by name.
  const developerRows: AdminDeveloperRow[] = developers
    .map((d) => ({
      id: d.id,
      name: d.name,
      archetype: d.archetype,
      source: d.source ?? "seed",
      githubLogin: d.githubLogin ?? null,
      importedAt: d.importedAt ?? null,
      repoCount: d.repos.length,
      totalCommits: d.totalCommits,
    }))
    .sort((a, b) =>
      a.source !== b.source
        ? a.source === "github" ? -1 : 1
        : (b.importedAt ?? "").localeCompare(a.importedAt ?? "") || a.name.localeCompare(b.name)
    );

  const rows: AdminUserRow[] = users.map((u) => ({
    ...u,
    hasGeminiKey: (presence[u.id] ?? []).includes("gemini"),
    hasGithubKey: (presence[u.id] ?? []).includes("github"),
  }));

  return (
    <div>
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
        <h1 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
          Admin dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-body">
          Manage who can use DevFit and what role they hold. Credential values are
          encrypted and never shown here — only whether each user has saved one.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Users" value={rows.length} />
          <Stat
            label="Admins"
            value={rows.filter((r) => r.role === "admin").length}
          />
          <Stat
            label="With keys"
            value={rows.filter((r) => r.hasGeminiKey || r.hasGithubKey).length}
            accent
          />
          <Stat label="Developers" value={developerCount} />
        </div>
      </section>

      <div className="mt-8">
        <AdminUserTable initial={rows} currentUserId={user.id} />
      </div>

      <div className="mt-10">
        <AdminDevelopers
          initial={developerRows}
          lastRefresh={
            lastRefresh
              ? {
                  at: lastRefresh.startedAt,
                  refreshed: lastRefresh.refreshed,
                  failed: lastRefresh.failed,
                  stoppedForRateLimit: lastRefresh.stoppedForRateLimit,
                }
              : null
          }
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? "border-accent-line bg-accent-soft" : "border-line bg-surface-2"
      }`}
    >
      <div
        className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
          accent ? "text-accent-soft-fg" : "text-muted"
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-extrabold tabular-nums ${
          accent ? "text-accent-soft-fg" : "text-heading"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
