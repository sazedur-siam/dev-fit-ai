"use client";

import { signOut } from "next-auth/react";

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
