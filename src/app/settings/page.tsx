import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getKeyStatuses } from "@/lib/db/keys";
import { countUserAnalyses } from "@/lib/db/analyses";
import { KeyManager } from "@/components/KeyManager";
import { ROLE_LABELS } from "@/lib/types";

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
      <section className="rounded-2xl border border-ink-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              Settings
            </h1>
            <p className="mt-1 text-sm text-ink-600">
              Signed in as{" "}
              <span className="font-medium text-ink-900">{user.email}</span>
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                  user.role === "admin"
                    ? "bg-pine-50 text-pine-700 ring-pine-500/20"
                    : "bg-ink-100 text-ink-600 ring-ink-200"
                }`}
              >
                {ROLE_LABELS[user.role]}
              </span>
            </p>
          </div>
          <div className="text-right text-xs text-ink-400">
            <div>
              <span className="font-semibold text-ink-800">{analysisCount}</span>{" "}
              analyses run
            </div>
            <div className="mt-0.5">joined {user.createdAt.slice(0, 10)}</div>
          </div>
        </div>
      </section>

      <h2 className="mt-8 text-lg font-semibold text-ink-900">Your API keys</h2>
      <p className="mb-4 mt-1 text-sm text-ink-600">
        DevFit uses your own credentials, so your usage counts against your quota,
        not a shared one.
      </p>

      <KeyManager initial={keys} />
    </div>
  );
}
