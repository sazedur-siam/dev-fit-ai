"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for failures in the root layout itself, where `error.tsx`
 * cannot help because the layout that would wrap it is the thing that broke. It
 * must render its own <html>/<body>.
 *
 * Deliberately dependency-free and inline-styled: if the layout failed, the
 * stylesheet it imports may not have loaded either.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          padding: "1.5rem",
        }}
      >
        <main
          style={{
            maxWidth: "30rem",
            width: "100%",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "1rem",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2.25rem", lineHeight: 1 }} aria-hidden>
            💪
          </div>
          <h1
            style={{
              margin: "1rem 0 0",
              fontSize: "1.25rem",
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            DevFit couldn&rsquo;t start
          </h1>
          <p
            style={{
              margin: "0.5rem 0 0",
              fontSize: "0.875rem",
              color: "#475569",
              lineHeight: 1.6,
            }}
          >
            The app failed before it could render. This is almost always missing
            configuration on the server — check{" "}
            <a href="/api/health" style={{ color: "#276749", fontWeight: 500 }}>
              /api/health
            </a>{" "}
            to see which values are absent.
          </p>
          {error.digest && (
            <p style={{ margin: "0.75rem 0 0", fontSize: "0.75rem", color: "#94a3b8" }}>
              Reference <code>{error.digest}</code>
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              background: "#276749",
              color: "#fff",
              border: 0,
              borderRadius: "0.375rem",
              padding: "0.625rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
