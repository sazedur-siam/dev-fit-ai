import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevFit — Find the Best-Fit Developer",
  description:
    "Rank developers against a target repo. Decision support for reassignments.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-ink-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight"
            >
              <span className="inline-block h-3 w-3 rounded-full bg-pine-500" />
              DevFit
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/" className="text-ink-600 hover:text-ink-900">
                Developers
              </Link>
              <Link
                href="/fit"
                className="rounded-md bg-pine-600 px-3 py-1.5 font-medium text-white hover:bg-pine-700"
              >
                Check fit
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 pb-10 pt-4 text-xs text-ink-400">
          Prototype · Decision support for humans, not an automated pass/fail.
        </footer>
      </body>
    </html>
  );
}
