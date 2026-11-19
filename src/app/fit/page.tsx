import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { resolveCredentials } from "@/lib/credentials";
import { FitView } from "@/components/FitView";
import { PROVIDER_META, describeModel } from "@/lib/providers";
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
  searchParams: Promise<{ repo?: string | string[]; need?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // `?repo=` / `?need=` pre-fill the form (history's "Re-run"). Only ever used as
  // initial input text; FitView validates it like anything typed.
  const { repo, need } = await searchParams;
  const initialRepoUrl = typeof repo === "string" ? repo.slice(0, 300) : "";
  const initialNeedText = typeof need === "string" ? need.slice(0, 2000) : "";

  // Only whether a key is resolvable — never the value — so the form can warn
  // before the user waits 30s for a failure.
  const creds = await resolveCredentials(user);

  return (
    <FitView
      initialRepoUrl={initialRepoUrl}
      initialNeedText={initialNeedText}
      hasLlmKey={creds.llmSource !== "none"}
      llmLabel={describeModel(creds.llm.provider, creds.llm.model)}
      llmKeyLabel={PROVIDER_META[creds.llm.provider].keyLabel}
      serverKeyAllowed={!isSelfService(user.source)}
    />
  );
}
