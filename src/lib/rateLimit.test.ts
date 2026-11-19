import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the Mongo-backed counter store, so the policy can be
// tested without a database. Same fixed-window semantics as recordHit().
const store = new Map<string, { count: number; expiresAt: Date }>();
vi.mock("@/lib/db/rateLimits", () => ({
  recordHit: vi.fn(async (key: string, windowSec: number, now = new Date()) => {
    const cur = store.get(key);
    const next =
      cur && cur.expiresAt > now
        ? { count: cur.count + 1, expiresAt: cur.expiresAt }
        : { count: 1, expiresAt: new Date(now.getTime() + windowSec * 1000) };
    store.set(key, next);
    return next;
  }),
  clearKey: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

const {
  RATE_LIMITS,
  checkLogin,
  checkRegister,
  clearLogin,
  clientIp,
  decide,
} = await import("@/lib/rateLimit");

beforeEach(() => store.clear());

describe("decide", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const in90s = new Date(now.getTime() + 90_000);

  it("allows up to and including the limit", () => {
    expect(decide(5, 5, in90s, now)).toEqual({ allowed: true, retryAfterSec: 0 });
  });

  it("refuses past the limit and says when to retry", () => {
    expect(decide(6, 5, in90s, now)).toEqual({ allowed: false, retryAfterSec: 90 });
  });

  it("never asks the client to retry in 0 seconds", () => {
    expect(decide(6, 5, now, now).retryAfterSec).toBe(1);
  });
});

describe("clientIp", () => {
  const from = (h: Record<string, string>) => (n: string) => h[n];

  it("takes the first x-forwarded-for entry", () => {
    expect(clientIp(from({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then to a shared bucket", () => {
    expect(clientIp(from({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(from({}))).toBe("unknown");
  });
});

describe("checkLogin", () => {
  const { limit } = RATE_LIMITS.loginPerEmail;

  it(`refuses attempt ${limit + 1} for one email`, async () => {
    for (let i = 0; i < limit; i++) {
      expect((await checkLogin("pm@example.com", "1.1.1.1")).allowed).toBe(true);
    }
    const refused = await checkLogin("pm@example.com", "1.1.1.1");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSec).toBeGreaterThan(0);
  });

  it("treats email case and whitespace as the same address", async () => {
    for (let i = 0; i < limit; i++) await checkLogin(" PM@Example.com ", `9.9.9.${i}`);
    expect((await checkLogin("pm@example.com", "8.8.8.8")).allowed).toBe(false);
  });

  it("counts by email even when attempts come from many IPs", async () => {
    for (let i = 0; i < limit; i++) await checkLogin("victim@example.com", `10.0.0.${i}`);
    expect((await checkLogin("victim@example.com", "10.0.0.99")).allowed).toBe(false);
  });

  it("limits one IP spraying many emails", async () => {
    const ipLimit = RATE_LIMITS.loginPerIp.limit;
    for (let i = 0; i < ipLimit; i++) await checkLogin(`user${i}@example.com`, "6.6.6.6");
    expect((await checkLogin("fresh@example.com", "6.6.6.6")).allowed).toBe(false);
  });

  it("does not depend on whether the account exists (no enumeration)", async () => {
    // The policy never looks the user up, so a registered and an unregistered
    // email produce identical decisions for identical attempt counts.
    const run = async (email: string) => {
      const out: boolean[] = [];
      for (let i = 0; i <= limit; i++) out.push((await checkLogin(email, `7.7.${email.length}.${i}`)).allowed);
      return out;
    };
    expect(await run("exists@example.com")).toEqual(await run("missing@example.com"));
  });

  it("a successful sign-in clears the email's failure count", async () => {
    for (let i = 0; i < limit; i++) await checkLogin("pm@example.com", "1.1.1.1");
    await clearLogin("PM@example.com");
    expect((await checkLogin("pm@example.com", "2.2.2.2")).allowed).toBe(true);
  });
});

describe("checkRegister", () => {
  it("refuses once an IP passes the hourly limit", async () => {
    const { limit } = RATE_LIMITS.registerPerIp;
    for (let i = 0; i < limit; i++) {
      expect((await checkRegister("3.3.3.3")).allowed).toBe(true);
    }
    expect((await checkRegister("3.3.3.3")).allowed).toBe(false);
    expect((await checkRegister("4.4.4.4")).allowed).toBe(true);
  });
});
