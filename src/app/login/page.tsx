import { redirect } from "next/navigation";
import { isAdminConfigured, isAuthConfigured } from "@/lib/auth";
import { readSessionSafe } from "@/lib/session";
import { LoginForm } from "@/components/LoginForm";
import { ROLE_HOME } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await readSessionSafe();
  if (session?.user) {
    redirect(ROLE_HOME[session.user.role] ?? "/fit");
  }

  const { callbackUrl } = await searchParams;
  const configured = isAuthConfigured();

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center">
        <span aria-hidden className="mx-auto block text-4xl leading-none">
          💪
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink-900">
          Sign in to DevFit
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          Enter the email and password you were given.
        </p>

        {configured ? (
          <>
            <LoginForm
              callbackUrl={
                callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : undefined
              }
            />
            {!isAdminConfigured() && (
              <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-left text-xs text-amber-600">
                <div className="font-semibold">No admin account configured</div>
                <p className="mt-1 text-ink-600">
                  Set <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code> in{" "}
                  <code>.env.local</code> and restart. The admin account is created
                  automatically on first sign-in.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-50 p-4 text-left text-xs text-amber-600">
            <div className="font-semibold">Sign-in isn&rsquo;t configured</div>
            <p className="mt-1 text-ink-600">
              Set <code>NEXTAUTH_SECRET</code> and <code>MONGODB_URI</code> in{" "}
              <code>.env.local</code>, then restart the dev server.
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-ink-400">
        Accounts are created by an administrator — there is no self-registration.
      </p>
    </div>
  );
}
