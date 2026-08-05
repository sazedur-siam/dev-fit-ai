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
      <div className="rounded-2xl border border-ink-200 bg-white p-6">
        <div className="h-7 w-56 rounded-md bg-ink-100" />
        <div className="mt-3 h-4 w-full max-w-xl rounded bg-ink-100" />
        <div className="mt-2 h-4 w-2/3 max-w-md rounded bg-ink-100" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm"
          >
            <div className="h-5 w-32 rounded bg-ink-100" />
            <div className="mt-3 h-4 w-20 rounded-full bg-ink-100" />
            <div className="mt-4 flex gap-1.5">
              <div className="h-4 w-14 rounded bg-ink-100" />
              <div className="h-4 w-10 rounded bg-ink-100" />
              <div className="h-4 w-12 rounded bg-ink-100" />
            </div>
            <div className="mt-3 h-3 w-full rounded bg-ink-100" />
          </div>
        ))}
      </div>

      <span className="sr-only" aria-live="polite">
        Loading…
      </span>
    </div>
  );
}
