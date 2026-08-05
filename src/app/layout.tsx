import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { readSessionSafe } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SIDEBAR_COOKIE, THEME_COOKIE, parseThemePreference } from "@/lib/types";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DevFit — Find the Best-Fit Developer",
    template: "%s · DevFit",
  },
  description:
    "Rank developers against a target repo. Decision support for reassignments.",
  // `app/icon.svg` is picked up by the file convention on its own; this only
  // adds the sizes hint browsers use when choosing between candidates.
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml", sizes: "any" }] },
};

/**
 * Tells the browser which theme the UI is in, so native chrome (form controls,
 * the mobile address bar) matches. Two entries rather than one: the OS
 * preference is authoritative when the user hasn't chosen.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f1a" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read from the JWT rather than the database: this runs on every page render,
  // and the role here only decides which nav items to show. Every privileged page
  // and route re-checks against MongoDB.
  //
  // Guarded because this runs for EVERY route, so anything thrown here takes the
  // whole site down with an opaque 500 — including /login, the one page able to
  // explain what is misconfigured. NextAuth throws in production when
  // NEXTAUTH_SECRET is missing, which is exactly how a fresh deploy fails.
  // Degrading to "signed out" keeps the app reachable and self-diagnosing.
  const user = (await readSessionSafe())?.user;

  const jar = await cookies();

  // Server-side so the sidebar paints at its stored width immediately — a
  // client-only preference would flash expanded on every navigation.
  const collapsed = jar.get(SIDEBAR_COOKIE)?.value === "collapsed";

  // Same reasoning for the theme. "system" deliberately stamps NO class:
  // globals.css resolves that case with `prefers-color-scheme`, which is why
  // there's no blocking inline script here and still no theme flash.
  const theme = parseThemePreference(jar.get(THEME_COOKIE)?.value);

  return (
    <html lang="en" className={theme === "system" ? undefined : theme}>
      <body>
        {user ? (
          <AppShell user={user} defaultCollapsed={collapsed} theme={theme}>
            {children}
          </AppShell>
        ) : (
          // Signed out, the only reachable page is /login — no chrome beyond the
          // theme switch, which has to stay reachable before sign-in.
          <div className="flex min-h-screen flex-col">
            <div className="mx-auto flex w-full max-w-6xl justify-end px-6 pt-6">
              <ThemeToggle initial={theme} className="w-28" />
            </div>
            <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
              {children}
            </main>
          </div>
        )}
      </body>
    </html>
  );
}
