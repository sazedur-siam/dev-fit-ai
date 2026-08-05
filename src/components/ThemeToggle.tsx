"use client";

import { useSyncExternalStore } from "react";
import { THEME_COOKIE, type ThemePreference } from "@/lib/types";

/**
 * Light / Dark / System switch.
 *
 * The preference is written to a cookie and applied by toggling the class on
 * `<html>` directly — no context, no provider, no `useTheme()`. The server reads
 * the same cookie in the root layout, so a reload paints the chosen theme
 * immediately; these controls only keep the live document in sync between
 * reloads.
 *
 * "System" is the absence of a class: `globals.css` resolves it with a
 * `prefers-color-scheme` block, so the OS can flip the app while it's open and
 * no blocking inline script is needed to avoid a first-paint flash.
 *
 * More than one control can be mounted at once — the sidebar has a segmented
 * version and the mobile header a cycling one — so the preference lives in a
 * tiny module-level store rather than in each component's state. Without it,
 * changing the theme in the header would leave the drawer's control showing the
 * old value.
 */

let current: ThemePreference | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setPreference(next: ThemePreference) {
  current = next;
  const root = document.documentElement;
  root.classList.toggle("dark", next === "dark");
  root.classList.toggle("light", next === "light");
  // 1 year; read back by the server layout on the next request.
  document.cookie = `${THEME_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
  for (const listener of listeners) listener();
}

/**
 * `initial` comes from the server-read cookie, and doubles as the server
 * snapshot so the first client render matches the markup exactly.
 */
function useThemePreference(initial: ThemePreference): ThemePreference {
  return useSyncExternalStore(
    subscribe,
    () => current ?? initial,
    () => initial
  );
}

const OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  },
  {
    value: "system",
    label: "System",
    icon: (
      <>
        <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
        <path d="M9 20.5h6M12 16.5v4" />
      </>
    ),
  },
];

function glyph(icon: React.ReactNode, className: string) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {icon}
    </svg>
  );
}

/** Segmented control — used where there is room for all three options. */
export function ThemeToggle({
  initial,
  className = "",
}: {
  initial: ThemePreference;
  className?: string;
}) {
  const theme = useThemePreference(initial);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5 ${className}`}
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => setPreference(option.value)}
            className={`flex flex-1 items-center justify-center rounded-md py-1.5 transition ${
              active
                ? "bg-surface text-accent shadow-card"
                : "text-muted hover:text-heading"
            }`}
          >
            {glyph(option.icon, "h-4 w-4")}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Single button that cycles light → dark → system, for the places a segmented
 * control doesn't fit: the collapsed sidebar rail and the mobile header.
 */
export function ThemeCycleButton({
  initial,
  className = "",
}: {
  initial: ThemePreference;
  className?: string;
}) {
  const theme = useThemePreference(initial);
  const index = OPTIONS.findIndex((o) => o.value === theme);
  const active = OPTIONS[index] ?? OPTIONS[2];
  const next = OPTIONS[(index + 1) % OPTIONS.length];

  return (
    <button
      type="button"
      onClick={() => setPreference(next.value)}
      aria-label={`Theme: ${active.label}. Switch to ${next.label}.`}
      title={`Theme: ${active.label}`}
      className={`rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-heading ${className}`}
    >
      {glyph(active.icon, "h-5 w-5")}
    </button>
  );
}
