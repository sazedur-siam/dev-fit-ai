"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ROLE_LABELS, SIDEBAR_COOKIE, type Role } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  accent?: boolean;
}

/**
 * Inline SVGs rather than an icon package: five icons don't justify a dependency,
 * and `currentColor` lets them inherit the link's active/hover state for free.
 */
const icon = (path: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className="h-5 w-5 shrink-0"
  >
    {path}
  </svg>
);

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Developers",
    icon: icon(
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 19 7" />
      </>
    ),
  },
  {
    href: "/fit",
    label: "Check fit",
    accent: true,
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87 1.2V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 2.6 15H2.5a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.09A1.7 1.7 0 0 0 11 2.5V2.5a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 21.4 9v.09a2 2 0 1 1 0 4H21.4Z" />
      </>
    ),
  },
  {
    href: "/admin",
    label: "Admin",
    adminOnly: true,
    icon: icon(
      <>
        <path d="M12 3l7.5 3.5v5c0 4.6-3.1 8.4-7.5 9.5-4.4-1.1-7.5-4.9-7.5-9.5v-5Z" />
        <path d="M9.5 12l1.8 1.8 3.4-3.6" />
      </>
    ),
  },
];

export function AppShell({
  user,
  defaultCollapsed,
  children,
}: {
  user: { email?: string | null; role: Role };
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  // Seeded from a cookie the server already read, so the sidebar renders at the
  // right width on the first paint instead of flashing open then collapsing.
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    // 1 year; readable by the server on the next request.
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"};path=/;max-age=31536000;samesite=lax`;
  }

  const items = NAV.filter((i) => !i.adminOnly || user.role === "admin");

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen">
      {/* Mobile scrim */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-ink-900/40 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-ink-200 bg-white transition-[width,transform] duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          collapsed ? "md:w-16" : "md:w-60"
        } w-60 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-ink-200 px-4 md:px-3">
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-2 overflow-hidden text-lg font-semibold tracking-tight text-ink-900 ${
              collapsed ? "md:hidden" : ""
            }`}
          >
            <span aria-hidden className="text-xl leading-none">
              💪
            </span>
            DevFit
          </Link>

          {/* Desktop-only: on mobile the drawer is the affordance, so a width
              toggle there would do nothing visible. When collapsed the wordmark
              hides and this centres, so there is always one clear control. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
            className={`hidden rounded-md p-2 text-ink-400 transition hover:bg-ink-100 hover:text-ink-600 md:block ${
              collapsed ? "md:mx-auto" : "ml-auto"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className={`h-5 w-5 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`}
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {items.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    // Closed here rather than in an effect on `pathname`: the click
                    // is what causes the navigation, so this is the cause, not a
                    // reaction to it.
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                      collapsed ? "md:justify-center md:px-0" : ""
                    } ${
                      active
                        ? "bg-pine-50 text-pine-700"
                        : item.accent
                          ? "text-pine-700 hover:bg-pine-50"
                          : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                    }`}
                  >
                    {item.icon}
                    <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-ink-200 p-2">
          <div
            className={`rounded-md px-3 py-2 ${collapsed ? "md:px-0 md:text-center" : ""}`}
          >
            <div
              className={`truncate text-xs font-medium text-ink-800 ${collapsed ? "md:hidden" : ""}`}
              title={user.email ?? undefined}
            >
              {user.email}
            </div>
            <div
              className={`mt-0.5 text-[11px] text-ink-400 ${collapsed ? "md:hidden" : ""}`}
            >
              {ROLE_LABELS[user.role]}
            </div>
            {collapsed && (
              <div
                aria-hidden
                title={`${user.email} · ${ROLE_LABELS[user.role]}`}
                className="mx-auto hidden h-7 w-7 place-items-center rounded-full bg-ink-100 text-[11px] font-semibold uppercase text-ink-600 md:grid"
              >
                {(user.email ?? "?").slice(0, 1)}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/login" })}
            title={collapsed ? "Sign out" : undefined}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 ${
              collapsed ? "md:justify-center md:px-0" : ""
            }`}
          >
            {icon(
              <>
                <path d="M15 17l5-5-5-5" />
                <path d="M20 12H9" />
                <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h7" />
              </>
            )}
            <span className={collapsed ? "md:hidden" : ""}>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only bar carrying the drawer trigger. */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-ink-200 bg-white px-4 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            className="rounded-md p-2 text-ink-600 hover:bg-ink-100 hover:text-ink-900"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden
              className="h-5 w-5"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span aria-hidden className="text-xl leading-none">
              💪
            </span>
            DevFit
          </span>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

        <footer className="mx-auto w-full max-w-6xl px-6 pb-10 pt-4 text-xs text-ink-400">
          Prototype · Decision support for humans, not an automated pass/fail.
        </footer>
      </div>
    </div>
  );
}
