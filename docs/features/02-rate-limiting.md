# 02 · Rate limiting on login and register

**Size:** S · **Needs:** none · **Cost:** free

## Why

OMAV limits login to 5 attempts a minute per email and the waitlist to 3 a minute
per IP. DevFit has **no rate limiting anywhere**. Anyone can try passwords against
an account as fast as the server answers, and `POST /api/register` can be
scripted to create accounts in bulk.

This is the only security gap on the list.

## What exists today

- [src/lib/auth.ts](../../src/lib/auth.ts) `authorize()` calls
  `verifyCredentials()` with no throttle.
- [src/app/api/register/route.ts](../../src/app/api/register/route.ts) has no
  throttle.
- bcrypt at cost 12 slows each guess a little. It doesn't stop a sustained attack.

## Plan

An in-memory counter **won't work**. On serverless hosting each instance has its
own memory, so an attacker spread across instances never hits the limit. Store
the counters in MongoDB, which DevFit already has.

1. **Add `src/lib/db/rateLimits.ts`** and a `rateLimits` entry in `COLLECTIONS`.
   Each document is `{ key, count, expiresAt }`, with:
   - a **TTL index** on `expiresAt` (`expireAfterSeconds: 0`), so Mongo deletes
     old windows itself, and
   - a unique index on `key`.
2. **Write one function** that counts a hit and says whether it's allowed:
   ```ts
   export async function hit(key: string, limit: number, windowSec: number):
     Promise<{ allowed: boolean; retryAfterSec: number }>
   ```
   Use a single `findOneAndUpdate` with `upsert` and `$inc`, so two requests at
   the same moment can't both slip under the limit.
3. **Login:** in `authorize(credentials, req)`, before `verifyCredentials`:
   - key `login:email:<lowercased email>` → 5 per 15 minutes
   - key `login:ip:<ip>` → 20 per 15 minutes
   - Count the email **whether or not the account exists.** Otherwise the limit
     itself reveals which emails are registered, which breaks CLAUDE.md rule 3.
   - When over the limit, `throw new Error("Too many attempts. Try again in a few minutes.")`.
     NextAuth v4 passes the message to the client as `result.error`. Show it in
     [LoginForm.tsx](../../src/components/LoginForm.tsx) in place of "Incorrect
     email or password".
4. **Register:** key `register:ip:<ip>` → 5 per hour. Return `429` with
   `{ error }` and a `Retry-After` header.
5. **Client IP:** read the first entry of `x-forwarded-for`, falling back to
   `x-real-ip`. Put this in one small helper. Note that the header can be faked
   if the app isn't behind a proxy that sets it. Vercel and most hosts do set it.
6. **Tests (with 01):** mock the collection. The 6th login attempt in the window
   is refused; an unknown email is counted the same as a known one.

## How it stays free

The counters are tiny documents in the Atlas M0 cluster DevFit already uses, and
the TTL index removes them automatically. No Redis and no paid rate-limit
service.

## Done when

- The 6th wrong password for one email within 15 minutes is refused, with a
  "too many attempts" message.
- The limit behaves the same for registered and unregistered emails.
- The `rateLimits` collection empties itself as windows expire.
