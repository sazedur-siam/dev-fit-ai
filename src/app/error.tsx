"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary. Without this, an unhandled server error renders the
 * platform's generic black "server error occurred" page, which tells the user
 * nothing and gives them nowhere to go.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-10">
      <div className="rounded-2xl border border-brick-500/30 bg-white p-8 text-center">
        <span aria-hidden className="text-4xl leading-none">
          💪
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink-900">
          Something went wrong
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-600">
          This page hit a server error. Retrying is usually worth a shot; if it keeps
          happening the deployment is probably misconfigured.
        </p>

        {error.digest && (
          <p className="mt-3 text-xs text-ink-400">
            Reference{" "}
            <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono">
              {error.digest}
            </code>
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-pine-600 px-4 py-2 text-sm font-medium text-white hover:bg-pine-700"
          >
            Try again
          </button>
          <Link
            href="/login"
            className="rounded-md border border-ink-200 px-4 py-2 text-sm font-medium text-ink-600 hover:border-pine-500/40 hover:text-pine-700"
          >
            Go to sign in
          </Link>
          <a
            href="/api/health"
            className="rounded-md border border-ink-200 px-4 py-2 text-sm font-medium text-ink-600 hover:border-pine-500/40 hover:text-pine-700"
          >
            Check configuration
          </a>
        </div>
      </div>
    </div>
  );
}
