import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listUsers } from "@/lib/db/users";
import { getKeyPresenceByUser } from "@/lib/db/keys";
import { countDevelopers } from "@/lib/db/developers";
import { AdminUserTable, type AdminUserRow } from "@/components/AdminUserTable";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Authoritative check against MongoDB, not the JWT claim.
  if (user.role !== "admin") redirect("/");

  const [users, presence, developerCount] = await Promise.all([
    listUsers(),
    getKeyPresenceByUser(),
    countDevelopers(),
  ]);

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
