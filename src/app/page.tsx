import { getAllDevelopers } from "@/lib/developerHelpers";
import { DeveloperCard } from "@/components/DeveloperCard";
import Link from "next/link";

export default function HomePage() {
  const devs = getAllDevelopers();
  return (
    <div>
      <section className="rounded-2xl border border-ink-200 bg-white p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              Strativ developers
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-600">
              A seeded set of 10 developers. Open one to see their contribution
              profile, or paste a repo URL on <span className="font-medium">Check fit</span> to
              see who fits it best.
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

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {devs.map((d) => (
          <DeveloperCard key={d.id} dev={d} />
        ))}
      </section>
    </div>
  );
}
