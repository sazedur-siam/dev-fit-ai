import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getKeyStatuses } from "@/lib/db/keys";
import { countUserAnalyses } from "@/lib/db/analyses";
import { KeyManager } from "@/components/KeyManager";
import { ROLE_LABELS, isSelfService } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [keys, analysisCount] = await Promise.all([
    getKeyStatuses(user.id),
    countUserAnalyses(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
              Settings
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-body">
              Signed in as{" "}
              <span className="font-semibold text-heading">{user.email}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  user.role === "admin"
                    ? "bg-role-fs-bg text-role-fs-fg"
                    : "bg-surface-2 text-body ring-1 ring-inset ring-line"
                }`}
              >
                {ROLE_LABELS[user.role]}
              </span>
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            <div>
              <span className="font-bold tabular-nums text-heading">
                {analysisCount}
              </span>{" "}
              analyses run
            </div>
            <div className="mt-0.5">joined {user.createdAt.slice(0, 10)}</div>
          </div>
        </div>
      </section>

      <h2 className="mt-8 text-lg font-bold text-heading">Your API keys</h2>
      <p className="mb-4 mt-1.5 text-sm leading-relaxed text-body">
        DevFit uses your own credentials, so your usage counts against your quota,
        not a shared one.
      </p>

      <KeyManager initial={keys} serverKeyAllowed={!isSelfService(user.source)} />
    </div>
  );
}
