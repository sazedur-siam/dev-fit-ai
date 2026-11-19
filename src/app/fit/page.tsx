import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { resolveCredentials } from "@/lib/credentials";
import { FitView } from "@/components/FitView";
import { isSelfService } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Server component wrapper so this page guards itself the same way /settings,
 * /admin and /history do.
 *
 * There is deliberately no proxy.ts (Next 16's rename of middleware.ts): the
 * framework recommends avoiding it where a server-side check suffices, and doing
 * the check here keeps authorization in one place per page rather than split
 * between an edge matcher and the page itself.
 */
export default async function FitPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // `?repo=` pre-fills the form (history's "Re-run"). It's only ever used as the
  // input's initial text; FitView validates it like anything typed.
  const { repo } = await searchParams;
  const initialRepoUrl = typeof repo === "string" ? repo.slice(0, 300) : "";

  // Only whether a key is resolvable — never the value — so the form can warn
  // before the user waits 30s for a failure.
  const creds = await resolveCredentials(user);

  return (
    <FitView
      initialRepoUrl={initialRepoUrl}
      hasGeminiKey={creds.geminiSource !== "none"}
      serverKeyAllowed={!isSelfService(user.source)}
    />
  );
}
