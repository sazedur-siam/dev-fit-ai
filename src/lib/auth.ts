import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google";
import { getUserByGoogleId, signInWithGoogle, verifyCredentials } from "@/lib/db/users";
import { checkLogin, clearLogin, clientIp, TOO_MANY_ATTEMPTS } from "@/lib/rateLimit";

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

/**
 * Whether "Continue with Google" is offered. Optional: without the two env vars
 * the provider is simply not registered and the button is hidden.
 */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export const authOptions: NextAuthOptions = {
  providers: [
    ...(isGoogleConfigured()
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        // Throttle before touching the password. The email is counted whether or
        // not an account exists, so being throttled reveals nothing about it.
        let limited = false;
        try {
          const headers = (req?.headers ?? {}) as Record<string, string | undefined>;
          const ip = clientIp((name) => headers[name]);
          limited = !(await checkLogin(credentials.email, ip)).allowed;
        } catch (err) {
          // If the counter store is unreachable, fail open: verifyCredentials hits
          // the same database and will fail on its own. Never let a driver error
          // message reach the client through NextAuth's `?error=` channel.
          console.error("[auth] rate limit check failed:", err);
        }
        if (limited) throw new Error(TOO_MANY_ATTEMPTS);

        // Returns null for both "no such account" and "wrong password", so the
        // form cannot be used to enumerate who has an account.
        const user = await verifyCredentials(credentials.email, credentials.password);
        if (!user) return null;
        await clearLogin(credentials.email).catch(() => {});
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],

  // The Credentials provider only supports JWT sessions. Google sign-ins use the
  // same JWT: with no adapter, NextAuth stores no account record of its own —
  // signInWithGoogle() keeps the link on our user document instead.
  session: { strategy: "jwt" },

  // Errors (a refused Google sign-in, a cancelled consent screen) come back to the
  // login page as ?error=… instead of NextAuth's unstyled default page.
  pages: { signIn: "/login", error: "/login" },

  callbacks: {
    /**
     * Google sign-ins are admitted only with a verified email, because accounts
     * are linked by email. This is also where the Google identity becomes one of
     * our users — created on first sign-in, linked to an existing account after.
     */
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      const google = profile as GoogleProfile | undefined;
      if (!google?.email || google.email_verified !== true || !account.providerAccountId) {
        return false;
      }
      const user = await signInWithGoogle({
        email: google.email,
        googleId: account.providerAccountId,
        name: google.name,
      });
      return Boolean(user);
    },

    /**
     * `user` is only present on the initial sign-in, which is when `authorize`
     * just read the database. Later requests pass the token through untouched, so
     * a normal page load costs no query.
     */
    async jwt({ token, user, account }) {
      if (account?.provider === "google") {
        // Here `user` is Google's profile, whose id is Google's — not ours. Map it
        // to the account signIn() just linked.
        const appUser = await getUserByGoogleId(account.providerAccountId);
        if (appUser) {
          token.uid = appUser.id;
          token.role = appUser.role;
        }
      } else if (user) {
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
