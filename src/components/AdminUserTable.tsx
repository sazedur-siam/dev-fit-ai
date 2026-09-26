"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, SOURCE_LABELS, type AppUser, type Role } from "@/lib/types";

export interface AdminUserRow extends AppUser {
  hasGeminiKey: boolean;
  hasGithubKey: boolean;
}

/** Suggests something long enough to clear the 8-char minimum comfortably. */
function suggestPassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 12);
}

const FIELD_CLASS =
  "mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-heading placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line";
const LABEL_CLASS =
  "text-[10px] font-bold uppercase tracking-[0.14em] text-muted";
const ROW_ACTION_CLASS =
  "rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-body transition hover:border-accent hover:text-accent-soft-fg disabled:cursor-not-allowed disabled:opacity-40";

export function AdminUserTable({
  initial,
  currentUserId,
}: {
  initial: AdminUserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ email: "", name: "", password: "" });
  const [creating, setCreating] = useState(false);

  const visible = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      r.email.toLowerCase().includes(q) ||
      (r.name ?? "").toLowerCase().includes(q)
    );
  });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: draft.email,
          name: draft.name || null,
          password: draft.password,
          role: "project_manager",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not create account");
      setRows((prev) => [...prev, json.user as AdminUserRow]);
      // Invalidate the client Router Cache; without it, navigating away and back
      // within the stale window would show the roster from before this change.
      router.refresh();
      setNotice(
        `Created ${json.user.email}. Share the password with them — it cannot be shown again.`
      );
      setDraft({ email: "", name: "", password: "" });
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setCreating(false);
    }
  }

  async function changeRole(id: string, role: Role) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not update role");
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, role: json.user.role } : r))
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role");
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(id: string, email: string) {
    const next = window.prompt(
      `New password for ${email} (at least 8 characters).\nThey will need this to sign in — it is not recoverable afterwards.`,
      suggestPassword()
    );
    if (next === null) return;
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not reset password");
      setNotice(`Password updated for ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, email: string) {
    if (
      !window.confirm(
        `Delete ${email}? Their stored keys and analysis history are deleted too. This cannot be undone.`
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not delete user");
      setRows((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
      setNotice(`Deleted ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete user");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-xl border border-danger-line bg-danger-bg p-3.5 text-sm font-medium text-danger-fg">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl border border-ok-line bg-ok-bg p-3.5 text-sm font-medium text-ok-fg">
          {notice}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by email or name…"
          aria-label="Filter users"
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-heading placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line sm:max-w-xs"
        />
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            if (!showCreate && !draft.password) {
              setDraft((d) => ({ ...d, password: suggestPassword() }));
            }
          }}
          className={`inline-flex w-max items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold transition ${
            showCreate
              ? "border border-line text-body hover:text-heading"
              : "bg-accent text-accent-contrast shadow-brand hover:bg-accent-hover"
          }`}
        >
          {showCreate ? "Cancel" : "+ Add project manager"}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={create}
          className="mb-6 rounded-2xl border border-line bg-surface p-5 shadow-card"
        >
          <h2 className="text-sm font-bold text-heading">New project manager</h2>
          <p className="mt-1 text-xs leading-relaxed text-body">
            They sign in with this email and password. There is no
            self-registration and no password-reset email, so pass the password on
            securely.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={LABEL_CLASS}>Email</span>
              <input
                type="email"
                required
                value={draft.email}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                placeholder="pm@company.com"
                className={FIELD_CLASS}
              />
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>
                Name <span className="font-medium normal-case">(optional)</span>
              </span>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Jane Doe"
                className={FIELD_CLASS}
              />
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Password</span>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  required
                  minLength={8}
                  value={draft.password}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, password: e.target.value }))
                  }
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-heading focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
                />
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, password: suggestPassword() }))
                  }
                  title="Generate a password"
                  className="rounded-lg border border-line px-3 text-xs font-semibold text-body transition hover:border-accent hover:text-accent-soft-fg"
                >
                  New
                </button>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="mt-5 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-contrast transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create account"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-184 text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-[10px] uppercase tracking-[0.14em] text-muted">
              <th className="px-4 py-3 font-bold">User</th>
              <th className="px-4 py-3 font-bold">Role</th>
              <th className="px-4 py-3 font-bold">Keys</th>
              <th className="px-4 py-3 font-bold">Last login</th>
              <th className="px-4 py-3 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((user) => {
              const isSelf = user.id === currentUserId;
              const isBusy = busyId === user.id;
              return (
                <tr
                  key={user.id}
                  className={`transition hover:bg-surface-2 ${isBusy ? "opacity-60" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-heading">
                      {user.name || user.email}
                      {isSelf && (
                        <span className="ml-2 text-[11px] font-normal text-muted">
                          (you)
                        </span>
                      )}
                    </div>
                    {user.name && (
                      <div className="text-xs text-muted">{user.email}</div>
                    )}
                    <div className="mt-0.5 text-[11px] text-muted">
                      {SOURCE_LABELS[user.source]}
                      {user.hasGoogle && user.source !== "google" && " · Google linked"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        user.role === "admin"
                          ? "bg-role-fs-bg text-role-fs-fg"
                          : "bg-surface-2 text-body ring-1 ring-inset ring-line"
                      }`}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 text-[11px]">
                      <span
                        className={`rounded px-1.5 py-0.5 font-semibold ${
                          user.hasGeminiKey
                            ? "bg-ok-bg text-ok-fg"
                            : "bg-surface-2 text-muted"
                        }`}
                      >
                        Gemini
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-semibold ${
                          user.hasGithubKey
                            ? "bg-ok-bg text-ok-fg"
                            : "bg-surface-2 text-muted"
                        }`}
                      >
                        GitHub
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {user.lastLoginAt ? user.lastLoginAt.slice(0, 10) : "never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void resetPassword(user.id, user.email)}
                        className={ROW_ACTION_CLASS}
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || isSelf}
                        title={isSelf ? "You cannot change your own role" : undefined}
                        onClick={() =>
                          void changeRole(
                            user.id,
                            user.role === "admin" ? "project_manager" : "admin"
                          )
                        }
                        className={ROW_ACTION_CLASS}
                      >
                        {user.role === "admin" ? "Demote" : "Make admin"}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || isSelf}
                        title={
                          isSelf ? "You cannot delete your own account" : undefined
                        }
                        onClick={() => void remove(user.id, user.email)}
                        className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-body transition hover:border-danger-line hover:bg-danger-bg hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-xs text-muted">
                  No user matches “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Key columns show only whether a credential is stored — values are encrypted
        and are never exposed, to admins included. Passwords are bcrypt hashes and
        cannot be read back either, only replaced.
      </p>
    </div>
  );
}
