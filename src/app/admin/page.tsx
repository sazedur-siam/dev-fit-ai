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
      <section className="rounded-2xl border border-ink-200 bg-white p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Admin dashboard
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          Manage who can use DevFit and what role they hold. Credential values are
          encrypted and never shown here — only whether each user has saved one.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Users" value={rows.length} />
          <Stat
            label="Admins"
            value={rows.filter((r) => r.role === "admin").length}
          />
          <Stat
            label="With keys"
            value={rows.filter((r) => r.hasGeminiKey || r.hasGithubKey).length}
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink-900">{value}</div>
    </div>
  );
}
