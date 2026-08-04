export function SubScoreBar({
  label,
  value,
  tone = "pine",
}: {
  label: string;
  value: number;
  tone?: "pine" | "amber" | "brick";
}) {
  const toneClass = {
    pine: "bg-pine-500",
    amber: "bg-amber-500",
    brick: "bg-brick-500",
  }[tone];
  return (
    <div className="text-xs">
      <div className="flex items-baseline justify-between">
        <span className="text-ink-600">{label}</span>
        <span className="font-semibold text-ink-800">
          {value.toFixed(1)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full ${toneClass}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
