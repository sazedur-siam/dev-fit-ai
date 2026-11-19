import type { AiFluency } from "@/lib/types";
import { AiFluencyBadge } from "./ArchetypeBadge";

/**
 * The AI Fluency section for an imported developer, shared by the developer page
 * and Profile Analyzer reports. Server component. `null` means not measured,
 * which is never shown as a 0.
 */
export function AiFluencyCard({
  fluency,
  notMeasuredHint,
}: {
  fluency: AiFluency | null;
  notMeasuredHint: string;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-heading">AI Fluency</h2>
        {fluency && <AiFluencyBadge fluency={fluency} />}
      </div>
      {fluency ? (
        <>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            AI-tool config committed in {fluency.reposWithConfig} of {fluency.reposMeasured}{" "}
            repositories checked. A config file shows a tool was set up, not how well it&rsquo;s
            used, and this score is never part of a fit ranking.
          </p>
          {fluency.tools.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {fluency.tools.map((t) => (
                <li key={t.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-heading">{t.label}</span>
                  <span className="text-xs text-muted">{t.repos.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{notMeasuredHint}</p>
      )}
    </section>
  );
}
