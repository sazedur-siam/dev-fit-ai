"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Self-registration: email, password, confirm. On success it signs straight in,
 * so a new user lands on /fit rather than being sent back to the login form.
 * The server re-checks everything here; these checks only save a round trip.
 */
export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirmPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't create your account. Please try again.");
        return;
      }

      const signedIn = await signIn("credentials", { email, password, redirect: false });
      if (!signedIn || signedIn.error) {
        // The account exists; only the automatic sign-in failed.
        router.replace("/login");
        return;
      }
      router.replace("/fit");
      router.refresh();
    } catch (err) {
      console.error("[register] failed:", err);
      setError("Couldn't create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-heading placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line";
  const labelClass =
    "text-[10px] font-bold uppercase tracking-[0.14em] text-muted";

  return (
    <form onSubmit={submit} className="text-left">
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
          autoComplete="email"
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
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          className={fieldClass}
        />
      </label>

      <label className="mt-4 block">
        <span className={labelClass}>Confirm password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          className={fieldClass}
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="mt-7 w-full rounded-lg bg-accent px-4 py-3 text-sm font-bold text-accent-contrast shadow-brand transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
