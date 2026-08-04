"use client";

import { useState } from "react";
import { ROLE_LABELS, type AppUser, type Role } from "@/lib/types";

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

export function AdminUserTable({
  initial,
  currentUserId,
}: {
  initial: AdminUserRow[];
  currentUserId: string;
}) {
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
        <div className="mb-4 rounded-lg border border-brick-500/30 bg-brick-50 p-3 text-sm text-brick-600">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-pine-500/30 bg-pine-50 p-3 text-sm text-pine-700">
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
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20 sm:max-w-xs"
        />
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            if (!showCreate && !draft.password) {
              setDraft((d) => ({ ...d, password: suggestPassword() }));
            }
          }}
          className="inline-flex w-max items-center rounded-md bg-pine-600 px-3 py-2 text-sm font-medium text-white hover:bg-pine-700"
        >
          {showCreate ? "Cancel" : "+ Add project manager"}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={create}
          className="mb-6 rounded-xl border border-ink-200 bg-white p-5"
        >
          <h2 className="text-sm font-semibold text-ink-900">
            New project manager
          </h2>
          <p className="mt-1 text-xs text-ink-600">
            They sign in with this email and password. There is no self-registration
            and no password-reset email, so pass the password on securely.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
                Email
              </span>
              <input
                type="email"
                required
                value={draft.email}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                placeholder="pm@company.com"
                className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
                Name <span className="normal-case text-ink-400">(optional)</span>
              </span>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Jane Doe"
                className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
                Password
              </span>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  required
                  minLength={8}
                  value={draft.password}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, password: e.target.value }))
                  }
                  className="w-full rounded-md border border-ink-200 px-3 py-2 font-mono text-sm focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
                />
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, password: suggestPassword() }))
                  }
                  title="Generate a password"
                  className="rounded-md border border-ink-200 px-2 text-xs font-medium text-ink-600 hover:border-pine-500/40 hover:text-pine-700"
                >
                  New
                </button>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="mt-4 rounded-md bg-pine-600 px-4 py-2 text-sm font-medium text-white hover:bg-pine-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create account"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full min-w-184 text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Keys</th>
              <th className="px-4 py-3 font-medium">Last login</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {visible.map((user) => {
              const isSelf = user.id === currentUserId;
              const isBusy = busyId === user.id;
              return (
                <tr key={user.id} className={isBusy ? "opacity-60" : undefined}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">
                      {user.name || user.email}
                      {isSelf && (
                        <span className="ml-2 text-[11px] font-normal text-ink-400">
                          (you)
                        </span>
                      )}
                    </div>
                    {user.name && (
                      <div className="text-xs text-ink-400">{user.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                        user.role === "admin"
                          ? "bg-pine-50 text-pine-700 ring-pine-500/20"
                          : "bg-ink-100 text-ink-600 ring-ink-200"
                      }`}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 text-[11px]">
                      <span
                        className={`rounded px-1.5 py-0.5 font-medium ${
                          user.hasGeminiKey
                            ? "bg-pine-50 text-pine-700"
                            : "bg-ink-100 text-ink-400"
                        }`}
                      >
                        Gemini
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-medium ${
                          user.hasGithubKey
                            ? "bg-pine-50 text-pine-700"
                            : "bg-ink-100 text-ink-400"
                        }`}
                      >
                        GitHub
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-600">
                    {user.lastLoginAt ? user.lastLoginAt.slice(0, 10) : "never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void resetPassword(user.id, user.email)}
                        className="rounded-md border border-ink-200 px-2 py-1 text-xs font-medium text-ink-600 hover:border-pine-500/40 hover:text-pine-700 disabled:cursor-not-allowed disabled:opacity-40"
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
                        className="rounded-md border border-ink-200 px-2 py-1 text-xs font-medium text-ink-600 hover:border-pine-500/40 hover:text-pine-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {user.role === "admin" ? "Demote" : "Make admin"}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || isSelf}
                        title={isSelf ? "You cannot delete your own account" : undefined}
                        onClick={() => void remove(user.id, user.email)}
                        className="rounded-md border border-ink-200 px-2 py-1 text-xs font-medium text-ink-600 hover:border-brick-500/40 hover:text-brick-600 disabled:cursor-not-allowed disabled:opacity-40"
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
                <td colSpan={5} className="px-4 py-8 text-center text-xs text-ink-400">
                  No user matches “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-ink-400">
        Key columns show only whether a credential is stored — values are encrypted
        and are never exposed, to admins included. Passwords are bcrypt hashes and
        cannot be read back either, only replaced.
      </p>
    </div>
  );
}
