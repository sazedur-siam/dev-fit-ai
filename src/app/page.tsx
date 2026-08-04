import { redirect } from "next/navigation";
import { getAllDevelopers } from "@/lib/db/developers";
import { DeveloperBrowser } from "@/components/DeveloperBrowser";
import { getCurrentUser } from "@/lib/session";
import Link from "next/link";

// The cohort lives in MongoDB now, so this page reads per request.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Everything is behind the login — there are no public pages.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const devs = await getAllDevelopers();

  if (devs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-10 text-center">
        <h1 className="text-xl font-semibold text-ink-900">No developers yet</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
          The cohort is stored in MongoDB. Seed it with{" "}
          <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">
            npm run seed
          </code>{" "}
          and reload.
        </p>
      </div>
    );
  }

  return (
    <div>
      <section className="rounded-2xl border border-ink-200 bg-white p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              Developers List
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-600">
              A seeded set of {devs.length} developers. Filter by name or stack,
              open one to see their contribution profile, or paste a repo URL on{" "}
              <span className="font-medium">Check fit</span> to see who fits it
              best.
            </p>
          </div>
          <Link
            href="/fit"
            className="inline-flex w-max items-center rounded-md bg-pine-600 px-4 py-2 text-sm font-medium text-white hover:bg-pine-700"
          >
            Check fit for a repo →
          </Link>
        </div>
      </section>

      <DeveloperBrowser developers={devs} />
    </div>
  );
}
