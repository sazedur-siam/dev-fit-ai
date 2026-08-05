"use client";

import Link from "next/link";
import { useEffect } from "react";
import { LogoMark } from "@/components/Logo";

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

  const secondary =
    "rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-body transition hover:border-accent hover:text-accent-soft-fg";

  return (
    <div className="mx-auto max-w-lg py-10">
      <div className="rounded-2xl border border-danger-line bg-surface p-8 text-center shadow-card-hover">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-5 text-xl font-extrabold tracking-tight text-heading">
          Something went wrong
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-body">
          This page hit a server error. Retrying is usually worth a shot; if it
          keeps happening the deployment is probably misconfigured.
        </p>

        {error.digest && (
          <p className="mt-3 text-xs text-muted">
            Reference <code className="font-mono">{error.digest}</code>
          </p>
        )}

        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-contrast shadow-brand transition hover:bg-accent-hover"
          >
            Try again
          </button>
          <Link href="/login" className={secondary}>
            Go to sign in
          </Link>
          <a href="/api/health" className={secondary}>
            Check configuration
          </a>
        </div>
      </div>
    </div>
  );
}
