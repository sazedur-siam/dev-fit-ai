import { NextResponse } from "next/server";
import { createUser } from "@/lib/db/users";
import { isAuthConfigured } from "@/lib/auth";
import { checkRegister, clientIp } from "@/lib/rateLimit";
import { parseJsonBody, RegisterBodySchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public self-registration. Always creates a project manager — a role in the body
 * is ignored — and the new account must bring its own API keys (credentials.ts
 * gives self-registered accounts no server-key fallback).
 *
 * Unlike login, this does say when an email is taken: a registration form can't
 * hide that without an email-confirmation flow, which the app doesn't have.
 */
export async function POST(req: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this server." },
      { status: 503 }
    );
  }

  try {
    const { allowed, retryAfterSec } = await checkRegister(
      clientIp((name) => req.headers.get(name))
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many accounts created from this network. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }
  } catch (err) {
    // Fail open: createUser below needs the same database and will report a real
    // outage itself.
    console.error("[register] rate limit check failed:", err);
  }

  const body = await parseJsonBody(req, RegisterBodySchema);
  if (!body.ok) return body.response;

  const { email, password, confirmPassword } = body.data;
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords don't match." }, { status: 400 });
  }

  try {
    const user = await createUser({ email, password, source: "self" });
    return NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create account";
    if (/already exists/i.test(message)) {
      return NextResponse.json(
        { error: "An account with that email already exists. Sign in instead." },
        { status: 409 }
      );
    }
    // Validation messages from createUser (bad email, short password) are 400s.
    const status = /at least|email address/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
