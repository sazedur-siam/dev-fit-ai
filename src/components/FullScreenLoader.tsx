/**
 * Centered blocking loader. Used while /api/fit runs, which takes 5–30s — long
 * enough that an inline spinner reads as "nothing happened".
 */
export function FullScreenLoader({
  message,
  hint,
}: {
  message: string;
  hint?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 px-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center shadow-pop">
        <div className="relative mx-auto h-14 w-14">
          {/* Soft halo behind the ring — pure decoration. */}
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/15 motion-reduce:animate-none" />
          <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-line-strong border-t-accent motion-reduce:animate-none" />
        </div>

        <p className="mt-6 text-sm font-bold text-heading">{message}</p>
        {hint && <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p>}

        <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
