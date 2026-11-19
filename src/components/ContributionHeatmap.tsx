import type { ContributionDay } from "@/lib/types";

/**
 * A year of contributions as a weeks × weekdays grid. Server component: plain
 * CSS grid, no chart library. Cells use the accent at four strengths, so the
 * same markup works in light and dark themes.
 */
const LEVELS = ["bg-surface-2", "bg-accent/25", "bg-accent/50", "bg-accent/75", "bg-accent"];

function level(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.ceil((count / max) * 4));
}

export function ContributionHeatmap({ days }: { days: ContributionDay[] }) {
  if (days.length === 0) return null;
  // Scale against the 95th percentile so one huge day doesn't wash out the rest.
  const sorted = days.map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b);
  const max = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 0;
  // Pad the start so each column is one Sunday-to-Saturday week.
  const lead = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const cells: (ContributionDay | null)[] = [...Array<null>(lead).fill(null), ...days];

  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="grid w-max grid-flow-col gap-[3px]"
        style={{ gridTemplateRows: "repeat(7, 11px)", gridAutoColumns: "11px" }}
        role="img"
        aria-label={`Contribution calendar: ${days.reduce((a, d) => a + d.count, 0)} contributions over ${days.length} days`}
      >
        {cells.map((d, i) =>
          d ? (
            <div
              key={d.date}
              title={`${d.count} contribution${d.count === 1 ? "" : "s"} on ${d.date}`}
              className={`rounded-[2px] ring-1 ring-inset ring-line/60 ${LEVELS[level(d.count, max)]}`}
            />
          ) : (
            <div key={`pad-${i}`} />
          )
        )}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted">
        Less
        {LEVELS.map((c) => (
          <span key={c} className={`h-[11px] w-[11px] rounded-[2px] ring-1 ring-inset ring-line/60 ${c}`} />
        ))}
        More
      </div>
    </div>
  );
}
