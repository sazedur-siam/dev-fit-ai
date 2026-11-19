"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ROLE_LABELS,
  SIDEBAR_COOKIE,
  type Role,
  type ThemePreference,
} from "@/lib/types";
import { Logo, LogoMark } from "./Logo";
import { ThemeCycleButton, ThemeToggle } from "./ThemeToggle";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

/**
 * Inline SVGs rather than an icon package: a handful of icons don't justify a
 * dependency, and `currentColor` lets them inherit the link's active/hover
 * state for free.
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
    href: "/shortlists",
    label: "Shortlists",
    icon: icon(
      <>
        <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
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
  theme,
  children,
}: {
  user: { email?: string | null; role: Role };
  defaultCollapsed: boolean;
  theme: ThemePreference;
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

  const collapseIcon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`h-5 w-5 shrink-0 ${collapsed ? "rotate-180" : ""}`}
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile scrim */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-ink-950/60 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-surface shadow-pop transition-[width,transform] duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 md:shadow-none ${
          collapsed ? "md:w-18" : "md:w-64"
        } w-64 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-4 md:px-3">
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            aria-label="DevFit — home"
            className="flex items-center overflow-hidden rounded-lg"
          >
            {collapsed ? (
              <LogoMark className="h-9 w-9 md:mx-auto" />
            ) : (
              <Logo markClassName="h-9 w-9" wordmarkClassName="text-lg" />
            )}
          </Link>

          {/* Desktop-only: on mobile the drawer is the affordance, so a width
              toggle there would do nothing visible. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
            className={`hidden rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-heading md:block ${
              collapsed ? "md:hidden" : "ml-auto"
            }`}
          >
            {collapseIcon}
          </button>
        </div>

        {/* Collapsed, the header has no room for a control, so the expand
            affordance moves under the mark. */}
        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={false}
            aria-label="Expand sidebar"
            title="Expand"
            className="mx-auto mt-2 hidden rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-heading md:block"
          >
            {collapseIcon}
          </button>
        )}

        <nav className="flex-1 overflow-y-auto p-3">
          <p
            className={`px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-faint ${
              collapsed ? "md:hidden" : ""
            }`}
          >
            Workspace
          </p>
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
                    className={`group relative flex items-center gap-3 rounded-lg py-2.5 pl-4 pr-3 text-sm transition ${
                      collapsed ? "md:justify-center md:px-0" : ""
                    } ${
                      active
                        ? "bg-accent-soft font-bold text-accent-soft-fg"
                        : "font-medium text-muted hover:bg-surface-2 hover:text-heading"
                    }`}
                  >
                    {/* Left-border indicator, absolutely positioned rather than a
                        real border so the label doesn't shift by 3px when a link
                        activates. */}
                    <span
                      aria-hidden
                      className={`absolute left-0 top-1/2 h-6 w-0.75 -translate-y-1/2 rounded-r-full bg-accent transition-opacity ${
                        active ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span className={active ? "text-accent" : undefined}>
                      {item.icon}
                    </span>
                    <span className={collapsed ? "md:hidden" : ""}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-line p-3">
          {collapsed ? (
            <ThemeCycleButton initial={theme} className="mx-auto mb-1 hidden md:block" />
          ) : null}
          <div className={collapsed ? "md:hidden" : ""}>
            <ThemeToggle initial={theme} className="mb-3" />
          </div>

          <div
            className={`flex items-center gap-2.5 rounded-lg bg-surface-2 p-2.5 ${
              collapsed ? "md:justify-center md:bg-transparent md:p-0" : ""
            }`}
          >
            <span
              aria-hidden
              title={
                collapsed ? `${user.email} · ${ROLE_LABELS[user.role]}` : undefined
              }
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold uppercase text-accent-contrast"
            >
              {(user.email ?? "?").slice(0, 1)}
            </span>
            <div className={`min-w-0 ${collapsed ? "md:hidden" : ""}`}>
              <div
                className="truncate text-xs font-semibold text-heading"
                title={user.email ?? undefined}
              >
                {user.email}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {ROLE_LABELS[user.role]}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/login" })}
            title={collapsed ? "Sign out" : undefined}
            className={`mt-1 flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-danger-bg hover:text-danger-fg ${
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
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-heading"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
              className="h-5 w-5"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Logo markClassName="h-8 w-8" wordmarkClassName="text-base" />
          <ThemeCycleButton initial={theme} className="ml-auto" />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-6 lg:py-10">
          {children}
        </main>

        <footer className="mx-auto w-full max-w-6xl px-5 pb-10 pt-4 text-xs text-muted sm:px-6">
          Prototype · Decision support for humans, not an automated pass/fail.
        </footer>
      </div>
    </div>
  );
}
