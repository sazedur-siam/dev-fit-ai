import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { maskSecret, openSecret, safeEqual, sealSecret } from "@/lib/crypto";

beforeAll(() => {
  // A throwaway key for this test run only; the key is read lazily on first use.
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("sealSecret / openSecret", () => {
  it("round-trips a value", () => {
    const sealed = sealSecret("AQ.Ab8-example-secret-45");
    expect(openSecret(sealed)).toBe("AQ.Ab8-example-secret-45");
  });

  it("never stores the plaintext and uses a fresh IV each time", () => {
    const a = sealSecret("same-value");
    const b = sealSecret("same-value");
    expect(a.ciphertext).not.toContain("same-value");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects a tampered ciphertext instead of returning garbage", () => {
    const sealed = sealSecret("secret");
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[0] ^= 0xff;
    expect(() =>
      openSecret({ ...sealed, ciphertext: bytes.toString("base64") })
    ).toThrow();
  });
});

describe("maskSecret", () => {
  it("shows only the first 6 and last 2 characters", () => {
    expect(maskSecret("AQ.Ab8xxxxxxxxxxxx45")).toBe("AQ.Ab8…45");
  });

  it("hides short values completely", () => {
    expect(maskSecret("short")).toBe("•••••");
    expect(maskSecret("")).toBe("••••");
  });
});

describe("safeEqual", () => {
  it("compares strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
