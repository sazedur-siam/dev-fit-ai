import type { Verdict } from "@/lib/types";

const STYLES: Record<Verdict, string> = {
  fit: "bg-pine-100 text-pine-700 ring-pine-500/20",
  "ramp-up": "bg-amber-50 text-amber-600 ring-amber-500/30",
  "not fit": "bg-brick-50 text-brick-600 ring-brick-500/30",
};

const LABELS: Record<Verdict, string> = {
  fit: "Fit",
  "ramp-up": "Ramp-up",
  "not fit": "Not fit",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STYLES[verdict]}`}
    >
      {LABELS[verdict]}
    </span>
  );
}
