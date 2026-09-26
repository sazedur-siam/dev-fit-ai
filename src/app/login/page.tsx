import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminConfigured, isAuthConfigured, isGoogleConfigured } from "@/lib/auth";
import { readSessionSafe } from "@/lib/session";
import { LoginForm } from "@/components/LoginForm";
import { AuthDivider, GoogleSignInButton } from "@/components/AuthButtons";
import { LogoMark } from "@/components/Logo";
import { ROLE_HOME } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * NextAuth sends failed sign-ins here as `?error=<code>`. Only OAuth failures
 * arrive this way — the password form reports its own errors inline.
 */
function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "AccessDenied") {
    return "Google sign-in was refused. The Google account needs a verified email, and that email can't already be linked to a different Google account.";
  }
  if (code === "Configuration") {
    return "The server isn't configured for sign-in yet — check /api/health.";
  }
  return "Sign-in with Google didn't complete. Please try again.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await readSessionSafe();
  // `id` too: a token without one can't resolve to a user, and redirecting it
  // onward would bounce straight back here.
  if (session?.user?.id) {
    redirect(ROLE_HOME[session.user.role] ?? "/fit");
  }

  const { callbackUrl: rawCallback, error } = await searchParams;
  const callbackUrl = rawCallback && rawCallback.startsWith("/") ? rawCallback : undefined;
  const configured = isAuthConfigured();
  const oauthError = errorMessage(error);

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card-hover">
        <LogoMark className="mx-auto h-14 w-14" />
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-heading">
          Sign in to Dev<span className="text-accent">Fit</span>
        </h1>
        <p className="mt-2 text-sm text-body">
          Sign in with your email and password
          {isGoogleConfigured() ? " or your Google account" : ""}.
        </p>

        {configured ? (
          <>
            <div className="mt-7">
              {oauthError && (
                <div
                  role="alert"
                  className="mb-4 rounded-xl border border-danger-line bg-danger-bg p-3.5 text-left text-sm font-medium text-danger-fg"
                >
                  {oauthError}
                </div>
              )}
              {isGoogleConfigured() && (
                <>
                  <GoogleSignInButton callbackUrl={callbackUrl} />
                  <AuthDivider />
                </>
              )}
              <LoginForm callbackUrl={callbackUrl} />
            </div>
            {!isAdminConfigured() && (
              <div className="mt-5 rounded-xl border border-warn-line bg-warn-bg p-3.5 text-left text-xs">
                <div className="font-bold text-warn-fg">
                  No admin account configured
                </div>
                <p className="mt-1 leading-relaxed text-body">
                  Set <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code> in{" "}
                  <code>.env.local</code> and restart. The admin account is created
                  automatically on first sign-in.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="mt-6 rounded-xl border border-warn-line bg-warn-bg p-4 text-left text-xs">
            <div className="font-bold text-warn-fg">
              Sign-in isn&rsquo;t configured
            </div>
            <p className="mt-1 leading-relaxed text-body">
              Set <code>NEXTAUTH_SECRET</code> and <code>MONGODB_URI</code> in{" "}
              <code>.env.local</code>, then restart the dev server.
            </p>
          </div>
        )}
      </div>

      {configured && (
        <p className="mt-5 text-center text-sm text-body">
          New to DevFit?{" "}
          <Link href="/register" className="font-bold text-accent hover:underline">
            Create an account
          </Link>
        </p>
      )}
    </div>
  );
}
