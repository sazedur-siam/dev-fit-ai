"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Credentials sign-in. `redirect: false` so a bad password re-renders the form
 * with an error instead of bouncing through NextAuth's default error page.
 */
export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      // Intentionally not "no such user" vs "wrong password".
      setError("Incorrect email or password.");
      setBusy(false);
      return;
    }

    // Land on the right page for this role. The session is fresh, so read it back
    // rather than assuming.
    let destination = callbackUrl ?? null;
    if (!destination) {
      try {
        const session = await fetch("/api/auth/session").then((r) => r.json());
        destination = session?.user?.role === "admin" ? "/admin" : "/fit";
      } catch {
        destination = "/fit";
      }
    }
    router.replace(destination);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 text-left">
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-brick-500/30 bg-brick-50 p-3 text-sm text-brick-600"
        >
          {error}
        </div>
      )}

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
          Email
        </span>
        <input
          type="email"
          required
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="mt-1 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
          Password
        </span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="mt-1 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-md bg-pine-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-pine-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
