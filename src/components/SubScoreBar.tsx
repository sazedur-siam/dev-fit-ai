export function SubScoreBar({
  label,
  value,
  tone = "accent",
}: {
  label: string;
  value: number;
  tone?: "accent" | "secondary" | "amber" | "brick";
}) {
  const toneClass = {
    accent: "bg-accent",
    secondary: "bg-secondary",
    amber: "bg-amber-500",
    brick: "bg-brick-500",
  }[tone];
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="text-xs">
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-muted">{label}</span>
        <span className="font-bold tabular-nums text-heading">
          {value.toFixed(1)}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line"
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${toneClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
