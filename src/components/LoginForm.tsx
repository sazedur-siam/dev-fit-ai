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

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      // `signIn` resolves to undefined when the request never produced a usable
      // response — treat that as a failure rather than falling through to a
      // navigation that cannot work.
      if (!res) {
        setError("Couldn't reach the sign-in service. Please try again.");
        return;
      }

      if (res.error) {
        // NextAuth reports a misconfigured server as "Configuration". Calling that
        // an incorrect password would send someone hunting for the wrong problem,
        // so the two are distinguished — while still never revealing whether a
        // given account exists.
        setError(
          res.error === "Configuration"
            ? "The server isn't configured for sign-in yet — check /api/health."
            : "Incorrect email or password."
        );
        return;
      }

      // Land on the right page for this role. The session is fresh, so read it
      // back rather than assuming.
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
    } catch (err) {
      // Without this, any throw left the button on "Signing in…" forever with no
      // message, because the reset only happened on the paths that returned early.
      console.error("[login] sign-in failed:", err);
      setError("Sign-in failed. Please try again.");
    } finally {
      // Runs on the success path too. Harmless there — the component unmounts on
      // navigation — and it guarantees the form is never left stuck.
      setBusy(false);
    }
  }

  const fieldClass =
    "mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-heading placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line";
  const labelClass =
    "text-[10px] font-bold uppercase tracking-[0.14em] text-muted";

  return (
    <form onSubmit={submit} className="mt-7 text-left">
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-danger-line bg-danger-bg p-3.5 text-sm font-medium text-danger-fg"
        >
          {error}
        </div>
      )}

      <label className="block">
        <span className={labelClass}>Email</span>
        <input
          type="email"
          required
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className={fieldClass}
        />
      </label>

      <label className="mt-4 block">
        <span className={labelClass}>Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className={fieldClass}
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="mt-7 w-full rounded-lg bg-accent px-4 py-3 text-sm font-bold text-accent-contrast shadow-brand transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
