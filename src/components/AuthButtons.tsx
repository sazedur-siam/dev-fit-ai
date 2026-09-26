"use client";

import { signIn, signOut } from "next-auth/react";

/**
 * `signOut` does not need a SessionProvider — only `useSession` does. The session
 * is read on the server everywhere else, so no provider is mounted and no
 * session-polling JS ships to the browser.
 */
export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/login" })}
      className="font-medium text-muted transition hover:text-heading"
    >
      Sign out
    </button>
  );
}

/**
 * Starts the Google OAuth redirect. Rendered only when the server has Google
 * configured; NextAuth brings the user back to `callbackUrl`, or to /login with
 * `?error=` if Google refused or the account couldn't be linked.
 */
export function GoogleSignInButton({
  callbackUrl,
  label = "Continue with Google",
}: {
  callbackUrl?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => void signIn("google", { callbackUrl: callbackUrl ?? "/fit" })}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-3 text-sm font-bold text-heading transition hover:bg-canvas"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
      </svg>
      {label}
    </button>
  );
}

/** "or" rule between the Google button and the email form. */
export function AuthDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
