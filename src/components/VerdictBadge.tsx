import type { Verdict } from "@/lib/types";

const STYLES: Record<Verdict, string> = {
  fit: "bg-ok-bg text-ok-fg ring-ok-line",
  "ramp-up": "bg-warn-bg text-warn-fg ring-warn-line",
  "not fit": "bg-danger-bg text-danger-fg ring-danger-line",
};

/** A filled dot ahead of the label, so the verdict survives a greyscale print. */
const DOTS: Record<Verdict, string> = {
  fit: "bg-brand-500",
  "ramp-up": "bg-amber-500",
  "not fit": "bg-brick-500",
};

const LABELS: Record<Verdict, string> = {
  fit: "Fit",
  "ramp-up": "Ramp-up",
  "not fit": "Not fit",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ring-1 ring-inset ${STYLES[verdict]}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOTS[verdict]}`} />
      {LABELS[verdict]}
    </span>
  );
}
