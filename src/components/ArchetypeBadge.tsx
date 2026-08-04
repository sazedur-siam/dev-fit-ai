import type { Archetype } from "@/lib/types";

const STYLES: Record<Archetype, string> = {
  frontend: "bg-sky-50 text-sky-700 ring-sky-500/20",
  backend: "bg-violet-50 text-violet-700 ring-violet-500/20",
  fullstack: "bg-pine-50 text-pine-700 ring-pine-500/20",
};

const LABELS: Record<Archetype, string> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Fullstack",
};

export function ArchetypeBadge({ archetype }: { archetype: Archetype }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[archetype]}`}
    >
      {LABELS[archetype]}
    </span>
  );
}
