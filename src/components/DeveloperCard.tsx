import Link from "next/link";
import type { DeveloperView } from "@/lib/types";
import { ArchetypeBadge } from "./ArchetypeBadge";

export function DeveloperCard({ dev }: { dev: DeveloperView }) {
  const net = dev.linesAdded - dev.linesDeleted;
  return (
    <Link
      href={`/developer/${dev.id}`}
      className="group block rounded-xl border border-ink-200 bg-white p-5 shadow-sm transition hover:border-pine-500/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink-900 group-hover:text-pine-700">
            {dev.name}
          </h3>
          <div className="mt-1">
            <ArchetypeBadge archetype={dev.archetype} />
          </div>
        </div>
        <div className="text-right text-xs text-ink-400">
          <div>
            <span className="font-semibold text-ink-800">
              {dev.totalCommits.toLocaleString()}
            </span>{" "}
            commits
          </div>
          <div className="mt-0.5">
            net <span className="font-semibold text-ink-800">+{net.toLocaleString()}</span> lines
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {dev.languages.slice(0, 6).map((lang) => (
          <span
            key={lang}
            className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-600"
          >
            {lang}
          </span>
        ))}
      </div>
      <p className="mt-3 line-clamp-2 text-xs text-ink-400">
        Recent: {dev.recentCommitMessages[0]}
      </p>
    </Link>
  );
}
