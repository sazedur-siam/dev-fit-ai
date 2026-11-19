import type { Archetype, DeveloperSource } from "@/lib/types";

/**
 * Role tokens: a pastel fill paired with a dark, high-contrast text tone from
 * the same hue (indigo / purple / emerald). Both halves are theme-aware, so the
 * pastels become deep tints on dark without the labels going muddy — every pair
 * clears 7:1 in either theme.
 */
const STYLES: Record<Archetype, string> = {
  frontend: "bg-role-fe-bg text-role-fe-fg",
  backend: "bg-role-be-bg text-role-be-fg",
  fullstack: "bg-role-fs-bg text-role-fs-fg",
};

const LABELS: Record<Archetype, string> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Fullstack",
};

export function ArchetypeBadge({ archetype }: { archetype: Archetype }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${STYLES[archetype]}`}
    >
      {LABELS[archetype]}
    </span>
  );
}

/** Neutral chip for stack/language tags — deliberately quiet next to a role. */
export function StackTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-body ring-1 ring-inset ring-line">
      {children}
    </span>
  );
}

/** Real (imported from GitHub) vs invented sample developer. */
export function SourceBadge({ source }: { source: DeveloperSource }) {
  return source === "github" ? (
    <span className="inline-flex items-center rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-soft-fg ring-1 ring-inset ring-accent-line">
      GitHub
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted ring-1 ring-inset ring-line">
      Sample
    </span>
  );
}
