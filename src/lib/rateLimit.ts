import { clearKey, recordHit } from "@/lib/db/rateLimits";

/**
 * Rate-limit policy for the public, unauthenticated endpoints. Storage lives in
 * `db/rateLimits.ts`; this module only decides.
 */
export const RATE_LIMITS = {
  /** Wrong passwords for one email address. */
  loginPerEmail: { limit: 5, windowSec: 15 * 60 },
  /** All sign-in attempts from one IP, across any number of emails. */
  loginPerIp: { limit: 20, windowSec: 15 * 60 },
  /**
   * Registration attempts from one IP. Counts every attempt, typos included, so
   * it sits a little above "accounts a real person would create" while still
   * stopping scripted sign-ups.
   */
  registerPerIp: { limit: 10, windowSec: 60 * 60 },
} as const;

/**
 * Error code thrown from `authorize()` when sign-in is throttled. NextAuth sends
 * the thrown message to the client as `signIn()`'s `res.error`, so this exact
 * string is what LoginForm matches on.
 */
export const TOO_MANY_ATTEMPTS = "TooManyAttempts";

export interface RateDecision {
  allowed: boolean;
  /** Seconds until the window resets; 0 when allowed. */
  retryAfterSec: number;
}

/** Pure decision from a counter, kept separate so it can be unit-tested. */
export function decide(
  count: number,
  limit: number,
  expiresAt: Date,
  now: Date = new Date()
): RateDecision {
  if (count <= limit) return { allowed: true, retryAfterSec: 0 };
  const ms = expiresAt.getTime() - now.getTime();
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(ms / 1000)) };
}

async function check(
  key: string,
  rule: { limit: number; windowSec: number }
): Promise<RateDecision> {
  const { count, expiresAt } = await recordHit(key, rule.windowSec);
  return decide(count, rule.limit, expiresAt);
}

/**
 * The client's IP as reported by the proxy in front of the app.
 *
 * `x-forwarded-for` can be forged when nothing upstream overwrites it. Vercel and
 * most hosts do set it, which is the deployment this assumes; locally it is often
 * absent and every request shares the "unknown" bucket.
 */
export function clientIp(get: (name: string) => string | null | undefined): string {
  const forwarded = get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || get("x-real-ip")?.trim() || "unknown";
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Throttle a password sign-in. The email is counted **whether or not an account
 * exists**, so the limit itself can't reveal which emails are registered.
 */
export async function checkLogin(email: string, ip: string): Promise<RateDecision> {
  const [byEmail, byIp] = await Promise.all([
    check(`login:email:${normalizeEmail(email)}`, RATE_LIMITS.loginPerEmail),
    check(`login:ip:${ip}`, RATE_LIMITS.loginPerIp),
  ]);
  if (!byEmail.allowed || !byIp.allowed) {
    return {
      allowed: false,
      retryAfterSec: Math.max(byEmail.retryAfterSec, byIp.retryAfterSec),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** A successful sign-in clears that email's failure count. */
export async function clearLogin(email: string): Promise<void> {
  await clearKey(`login:email:${normalizeEmail(email)}`);
}

export async function checkRegister(ip: string): Promise<RateDecision> {
  return check(`register:ip:${ip}`, RATE_LIMITS.registerPerIp);
}
