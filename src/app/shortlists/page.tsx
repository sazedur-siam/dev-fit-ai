import { redirect } from "next/navigation";
import { ShortlistsManager, type ShortlistDeveloper } from "@/components/ShortlistsManager";
import { listUserAnalyses } from "@/lib/db/analyses";
import { getAllDevelopers } from "@/lib/db/developers";
import { listShortlists } from "@/lib/db/shortlists";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ShortlistsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [lists, developers, analyses] = await Promise.all([
    listShortlists(user.id),
    getAllDevelopers(),
    listUserAnalyses(user.id, 100),
  ]);

  const devMap: Record<string, ShortlistDeveloper> = {};
  for (const d of developers) devMap[d.id] = { id: d.id, name: d.name, archetype: d.archetype };

  // Label each list's source analysis, scoped to this user's own history.
  const sources: Record<string, string> = {};
  for (const a of analyses) {
    sources[a.id] = a.repoUrl
      ? `${a.owner}/${a.repo}`
      : `"${(a.needText ?? "").slice(0, 40)}${(a.needText ?? "").length > 40 ? "…" : ""}"`;
  }

  return (
    <div>
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
        <h1 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
          Shortlists
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-body">
          Named lists of developers for a client or project. Only you can see them.
        </p>
      </section>
      <ShortlistsManager initial={lists} developers={devMap} sources={sources} />
    </div>
  );
}
