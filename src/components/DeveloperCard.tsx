import Link from "next/link";
import type { Archetype, DeveloperView } from "@/lib/types";
import { ArchetypeBadge, StackTag, SourceBadge } from "./ArchetypeBadge";

/** Same hue family as the role badge, so avatar and badge read as one unit. */
const AVATAR_TONE: Record<Archetype, string> = {
  frontend: "bg-role-fe-bg text-role-fe-fg",
  backend: "bg-role-be-bg text-role-be-fg",
  fullstack: "bg-role-fs-bg text-role-fs-fg",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function DeveloperCard({ dev }: { dev: DeveloperView }) {
  const net = dev.linesAdded - dev.linesDeleted;
  // Frameworks first: "Next.js" says more about a developer than "TSX".
  const skills = [...dev.frameworks, ...dev.languages];
  const shown = skills.slice(0, 4);
  const overflow = skills.length - shown.length;

  return (
    <Link
      href={`/developer/${dev.id}`}
      className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-accent-line hover:shadow-card-hover focus-visible:-translate-y-0.5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold ${AVATAR_TONE[dev.archetype]}`}
        >
          {initials(dev.name)}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-heading transition group-hover:text-accent-soft-fg">
            {dev.name}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ArchetypeBadge archetype={dev.archetype} />
            <SourceBadge source={dev.source ?? "seed"} />
          </div>
        </div>

        <span
          aria-hidden
          className="mt-1 text-faint transition group-hover:translate-x-0.5 group-hover:text-accent"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line">
        <div className="bg-surface-2 px-3 py-2.5">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Commits
          </dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums text-heading">
            {dev.totalCommits.toLocaleString()}
          </dd>
        </div>
        <div className="bg-surface-2 px-3 py-2.5">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Net lines
          </dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums text-heading">
            +{net.toLocaleString()}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {shown.map((lang) => (
          <StackTag key={lang}>{lang}</StackTag>
        ))}
        {overflow > 0 && (
          <span className="inline-flex items-center px-1 text-[11px] font-medium text-muted">
            +{overflow} more
          </span>
        )}
      </div>

      <p className="mt-auto line-clamp-2 pt-4 font-mono text-[11px] leading-relaxed text-muted">
        <span aria-hidden className="text-accent">
          ›{" "}
        </span>
        {dev.recentCommitMessages[0]}
      </p>
    </Link>
  );
}
