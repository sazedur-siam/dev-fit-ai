import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyCredentials } from "@/lib/db/users";

/**
 * Whether sign-in can work at all. Checked at request time, never at import time:
 * throwing here would break `npm run build` in any environment without secrets
 * (CI, a fresh clone), and a build is not the right place to discover a missing
 * credential.
 */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.NEXTAUTH_SECRET && process.env.MONGODB_URI);
}

/** Whether an admin account can be bootstrapped. Surfaced on the login page. */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        // Returns null for both "no such account" and "wrong password", so the
        // form cannot be used to enumerate who has an account.
        const user = await verifyCredentials(credentials.email, credentials.password);
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],

  // The Credentials provider only supports JWT sessions — there is no database
  // session to look up, because no OAuth account record is created.
  session: { strategy: "jwt" },

  pages: { signIn: "/login" },

  callbacks: {
    /**
     * `user` is only present on the initial sign-in, which is when `authorize`
     * just read the database. Later requests pass the token through untouched, so
     * a normal page load costs no query.
     */
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: "admin" | "project_manager" }).role;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.uid === "string" ? token.uid : "";
        // A UI hint only. Every privileged route re-reads the role from MongoDB —
        // see requireAdmin() — so a demotion takes effect immediately instead of
        // waiting for this token to expire.
        session.user.role = token.role === "admin" ? "admin" : "project_manager";
      }
      return session;
    },
  },
};
