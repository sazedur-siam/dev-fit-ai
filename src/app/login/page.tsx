import { redirect } from "next/navigation";
import { isAdminConfigured, isAuthConfigured } from "@/lib/auth";
import { readSessionSafe } from "@/lib/session";
import { LoginForm } from "@/components/LoginForm";
import { LogoMark } from "@/components/Logo";
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
    <div className="mx-auto max-w-md py-6">
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card-hover">
        <LogoMark className="mx-auto h-14 w-14" />
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-heading">
          Sign in to Dev<span className="text-accent">Fit</span>
        </h1>
        <p className="mt-2 text-sm text-body">
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

      <p className="mt-5 text-center text-xs text-muted">
        Accounts are created by an administrator — there is no self-registration.
      </p>
    </div>
  );
}
