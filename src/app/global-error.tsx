"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for failures in the root layout itself, where `error.tsx`
 * cannot help because the layout that would wrap it is the thing that broke. It
 * must render its own <html>/<body>.
 *
 * Deliberately dependency-free: if the layout failed, the stylesheet it imports
 * may not have loaded either — so this page ships its own <style>. That block is
 * also the only way to get dark mode here, since inline styles can't carry a
 * media query, and it means the fallback still matches the OS rather than
 * flashing a white card at someone in a dark room.
 */

const STYLES = `
  :root {
    color-scheme: light dark;
    --g-canvas: #f8fafc;
    --g-surface: #ffffff;
    --g-line: #e2e8f0;
    --g-heading: #0f172a;
    --g-body: #334155;
    --g-muted: #64748b;
    --g-accent: #10b981;
    --g-accent-fg: #ffffff;
    --g-link: #047857;
    --g-tile: #0f172a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --g-canvas: #0a0f1a;
      --g-surface: #121a2a;
      --g-line: #26324a;
      --g-heading: #f1f5f9;
      --g-body: #cbd5e1;
      --g-muted: #94a3b8;
      --g-accent: #34d399;
      --g-accent-fg: #052e20;
      --g-link: #6ee7b7;
      --g-tile: #1e293b;
    }
  }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background: var(--g-canvas);
    color: var(--g-body);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .card {
    max-width: 30rem;
    width: 100%;
    background: var(--g-surface);
    border: 1px solid var(--g-line);
    border-radius: 1rem;
    padding: 2rem;
    text-align: center;
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05);
  }
  .card h1 {
    margin: 1.25rem 0 0;
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: -0.015em;
    color: var(--g-heading);
  }
  .card p {
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
    line-height: 1.6;
  }
  .card a { color: var(--g-link); font-weight: 600; }
  .ref { margin-top: 0.75rem; font-size: 0.75rem; color: var(--g-muted); }
  .retry {
    margin-top: 1.5rem;
    background: var(--g-accent);
    color: var(--g-accent-fg);
    border: 0;
    border-radius: 0.5rem;
    padding: 0.7rem 1.1rem;
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
  }
`;

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
      <head>
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body>
        <main className="card">
          <svg viewBox="0 0 64 64" width="48" height="48" aria-hidden>
            <rect width="64" height="64" rx="16" fill="var(--g-tile)" />
            <g
              transform="translate(32 32) scale(0.8) translate(-32 -32)"
              fill="var(--g-accent)"
              stroke="var(--g-accent)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 20 6 32l8 12" fill="none" />
              <rect x="16" y="24" width="6" height="16" rx="2" stroke="none" />
              <path d="M22 32h20" />
              <rect x="42" y="24" width="6" height="16" rx="2" stroke="none" />
              <path d="M50 20l8 12-8 12" fill="none" />
            </g>
          </svg>
          <h1>DevFit couldn&rsquo;t start</h1>
          <p>
            The app failed before it could render. This is almost always missing
            configuration on the server — check <a href="/api/health">/api/health</a>{" "}
            to see which values are absent.
          </p>
          {error.digest && (
            <p className="ref">
              Reference <code>{error.digest}</code>
            </p>
          )}
          <button type="button" onClick={reset} className="retry">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
