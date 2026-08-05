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
      <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-12 text-center shadow-card">
        <h1 className="text-xl font-bold text-heading">No developers yet</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-body">
          The cohort is stored in MongoDB. Seed it with <code>npm run seed</code>{" "}
          and reload.
        </p>
      </div>
    );
  }

  return (
    <div>
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-secondary-soft-fg">
              Cohort
            </span>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
              Developers
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-body">
              A seeded set of {devs.length} developers. Filter by name or stack,
              open one to see their contribution profile, or paste a repo URL on{" "}
              <span className="font-semibold text-heading">Check fit</span> to see
              who fits it best.
            </p>
          </div>
          <Link
            href="/fit"
            className="inline-flex w-max items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-contrast shadow-brand transition hover:bg-accent-hover"
          >
            Check fit for a repo
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <DeveloperBrowser developers={devs} />
    </div>
  );
}
