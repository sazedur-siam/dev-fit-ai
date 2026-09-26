import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthConfigured, isGoogleConfigured } from "@/lib/auth";
import { readSessionSafe } from "@/lib/session";
import { RegisterForm } from "@/components/RegisterForm";
import { AuthDivider, GoogleSignInButton } from "@/components/AuthButtons";
import { LogoMark } from "@/components/Logo";
import { ROLE_HOME } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create account" };

/**
 * Public, like /login. Every new account is a project manager and has to save
 * its own Gemini key before it can run a fit check.
 */
export default async function RegisterPage() {
  const session = await readSessionSafe();
  if (session?.user?.id) {
    redirect(ROLE_HOME[session.user.role] ?? "/fit");
  }

  if (!isAuthConfigured()) redirect("/login");

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card-hover">
        <LogoMark className="mx-auto h-14 w-14" />
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-heading">
          Create your Dev<span className="text-accent">Fit</span> account
        </h1>
        <p className="mt-2 text-sm text-body">
          You&rsquo;ll add your own Gemini API key after signing up.
        </p>

        <div className="mt-7">
          {isGoogleConfigured() && (
            <>
              <GoogleSignInButton label="Sign up with Google" />
              <AuthDivider />
            </>
          )}
          <RegisterForm />
        </div>
      </div>

      <p className="mt-5 text-center text-sm text-body">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
