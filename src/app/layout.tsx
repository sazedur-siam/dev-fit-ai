import type { Metadata } from "next";
import { cookies } from "next/headers";
import { readSessionSafe } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { SIDEBAR_COOKIE } from "@/lib/types";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevFit — Find the Best-Fit Developer",
  description:
    "Rank developers against a target repo. Decision support for reassignments.",
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

  // Server-side so the sidebar paints at its stored width immediately — a
  // client-only preference would flash expanded on every navigation.
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <html lang="en">
      <body>
        {user ? (
          <AppShell user={user} defaultCollapsed={collapsed}>
            {children}
          </AppShell>
        ) : (
          // Signed out, the only reachable page is /login — no chrome, just the
          // centered card.
          <main className="mx-auto w-full max-w-6xl px-6 py-16">{children}</main>
        )}
      </body>
    </html>
  );
}
