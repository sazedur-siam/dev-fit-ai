import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { resolveCredentials } from "@/lib/credentials";
import { FitView } from "@/components/FitView";

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
export default async function FitPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Only whether a key is resolvable — never the value — so the form can warn
  // before the user waits 30s for a failure.
  const creds = await resolveCredentials(user.id);

  return <FitView hasGeminiKey={creds.geminiSource !== "none"} />;
}
