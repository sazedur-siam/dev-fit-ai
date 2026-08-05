/**
 * Shown while a route segment renders on the server.
 *
 * Every page here is dynamic and queries MongoDB, so a navigation always costs a
 * round trip. Without a Suspense boundary the browser shows the *previous* page
 * until the new one is ready, which reads as the app having ignored the click.
 * Streaming this immediately is what makes navigation feel responsive; it does not
 * make the query faster.
 */
export default function Loading() {
  return (
    <div className="animate-pulse motion-reduce:animate-none" aria-hidden>
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
        <div className="h-5 w-20 rounded-full bg-surface-2" />
        <div className="mt-3 h-8 w-56 rounded-lg bg-surface-2" />
        <div className="mt-3 h-4 w-full max-w-xl rounded bg-surface-2" />
        <div className="mt-2 h-4 w-2/3 max-w-md rounded bg-surface-2" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-line bg-surface p-5 shadow-card"
          >
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-surface-2" />
              <div className="flex-1">
                <div className="h-5 w-32 rounded bg-surface-2" />
                <div className="mt-2 h-4 w-20 rounded-full bg-surface-2" />
              </div>
            </div>
            <div className="mt-4 h-14 rounded-xl bg-surface-2" />
            <div className="mt-4 flex gap-1.5">
              <div className="h-5 w-16 rounded-md bg-surface-2" />
              <div className="h-5 w-12 rounded-md bg-surface-2" />
              <div className="h-5 w-14 rounded-md bg-surface-2" />
            </div>
            <div className="mt-4 h-3 w-full rounded bg-surface-2" />
          </div>
        ))}
      </div>

      <span className="sr-only" aria-live="polite">
        Loading…
      </span>
    </div>
  );
}
