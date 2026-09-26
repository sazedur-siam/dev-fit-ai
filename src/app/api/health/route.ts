import { NextResponse } from "next/server";
import { resolveSrv } from "node:dns/promises";
import { connect as tlsConnect } from "node:tls";
import { COLLECTIONS, getDb } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deployment self-check. Reports which configuration is present and whether the
 * database is reachable, so a broken deploy can be diagnosed from one request
 * instead of hunting through platform logs.
 *
 * Reports booleans and counts only — never a secret value, and never a hostname or
 * connection string. It is intentionally reachable while signed out, because the
 * failures it exists to diagnose stop anyone from signing in at all.
 */

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/** Whether ENCRYPTION_KEY is not just present but actually usable. */
function encryptionKeyValid(): boolean {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) return false;
  const buf = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  return buf.length === 32;
}

/**
 * Probe the network path to the database independently of the driver, so a failure
 * can be attributed rather than guessed at.
 *
 * The layers fail distinguishably: DNS says the cluster name is wrong, TCP says
 * something is blocking the port, and a TLS handshake that opens and is then torn
 * down is how Atlas rejects an IP that is not on its access list. Hostnames and
 * credentials are never reported.
 */
async function probeNetworkPath(): Promise<Record<string, unknown>> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return { checked: false };

  const match = uri.match(/^mongodb(\+srv)?:\/\/(?:[^@]*@)?([^/?,]+)/i);
  if (!match) return { checked: false, reason: "could not parse host from URI" };

  const isSrv = Boolean(match[1]);
  const hostFromUri = match[2].split(":")[0];

  let target = hostFromUri;
  let port = Number(match[2].split(":")[1] ?? 27017);
  let srvRecords: number | null = null;

  if (isSrv) {
    try {
      const records = await resolveSrv(`_mongodb._tcp.${hostFromUri}`);
      srvRecords = records.length;
      if (records.length === 0) {
        return { dns: false, reason: "SRV lookup returned no records" };
      }
      target = records[0].name;
      port = records[0].port;
    } catch (err) {
      return {
        dns: false,
        srvRecords,
        reason: `SRV lookup failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 160),
      };
    }
  }

  const tls = await new Promise<Record<string, unknown>>((resolve) => {
    const socket = tlsConnect(
      { host: target, port, servername: target, timeout: 6000 },
      () => {
        // Handshake completed: the IP is permitted and TLS is sound.
        socket.destroy();
        resolve({ tcp: true, tlsHandshake: true });
      }
    );
    socket.on("error", (err: NodeJS.ErrnoException) => {
      socket.destroy();
      resolve({
        tcp: err.code !== "ECONNREFUSED" && err.code !== "ENOTFOUND",
        tlsHandshake: false,
        code: err.code ?? null,
        message: String(err.message).slice(0, 160),
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ tcp: false, tlsHandshake: false, code: "TIMEOUT" });
    });
  });

  return { dns: true, srvRecords, port, ...tls };
}

export async function GET() {
  const env = {
    MONGODB_URI: present("MONGODB_URI"),
    MONGODB_DB: present("MONGODB_DB"),
    NEXTAUTH_SECRET: present("NEXTAUTH_SECRET"),
    NEXTAUTH_URL: present("NEXTAUTH_URL"),
    ENCRYPTION_KEY: present("ENCRYPTION_KEY"),
    ENCRYPTION_KEY_is32Bytes: encryptionKeyValid(),
    ADMIN_EMAIL: present("ADMIN_EMAIL"),
    ADMIN_PASSWORD: present("ADMIN_PASSWORD"),
    GOOGLE_SIGN_IN: present("GOOGLE_CLIENT_ID") && present("GOOGLE_CLIENT_SECRET"),
    GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || "(default)",
  };

  const problems: string[] = [];
  if (!env.MONGODB_URI) problems.push("MONGODB_URI is not set");
  if (!env.NEXTAUTH_SECRET)
    problems.push("NEXTAUTH_SECRET is not set — every route will 500");
  if (!env.ENCRYPTION_KEY) problems.push("ENCRYPTION_KEY is not set");
  else if (!env.ENCRYPTION_KEY_is32Bytes)
    problems.push("ENCRYPTION_KEY does not decode to 32 bytes");
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD)
    problems.push("ADMIN_EMAIL / ADMIN_PASSWORD not set — nobody can sign in");
  if (!env.NEXTAUTH_URL)
    problems.push("NEXTAUTH_URL is not set — sign-in may redirect to the wrong host");

  let database: Record<string, unknown> = { reachable: false };
  if (env.MONGODB_URI) {
    try {
      const db = await getDb();
      const [developers, users] = await Promise.all([
        db.collection(COLLECTIONS.developers).countDocuments(),
        db.collection(COLLECTIONS.users).countDocuments(),
      ]);
      database = { reachable: true, name: db.databaseName, developers, users };
      if (developers === 0)
        problems.push("No developers — run `npm run seed` against this database");
      if (users === 0)
        problems.push("No users — run `npm run seed` to create the admin account");
    } catch (err) {
      // Collapse whitespace: driver errors carry trailing newlines, which make the
      // JSON payload awkward to read and to parse.
      const message = (err instanceof Error ? err.message : String(err))
        .replace(/\s+/g, " ")
        .trim();
      database = { reachable: false, error: message.slice(0, 200) };

      // Atlas rejects a non-allowlisted IP by aborting the TLS handshake rather
      // than refusing the connection, so the driver surfaces "tlsv1 alert internal
      // error / SSL alert number 80". That reads like a certificate fault and sends
      // people to the wrong problem entirely — name the real cause.
      const looksLikeBlockedIp =
        /alert number 80|tlsv1 alert internal error|ssl3_read_bytes/i.test(message);
      const looksLikeTimeout = /timed out|ETIMEDOUT|ENOTFOUND|ServerSelection/i.test(
        message
      );

      problems.push(
        looksLikeBlockedIp || looksLikeTimeout
          ? "Database unreachable — this is almost always the MongoDB Atlas access list. Add 0.0.0.0/0 under Network Access, since serverless platforms have no fixed egress IP. (Atlas reports a blocked IP as a TLS alert, not a connection refusal.)"
          : "Database unreachable"
      );
    }
  }

  // Only worth the extra round trip when the driver could not connect.
  const network = database.reachable ? { checked: false } : await probeNetworkPath();

  if (!database.reachable && network.dns === true) {
    if (network.tlsHandshake === true) {
      problems.push(
        "TLS to the database succeeded but the driver could not connect — the network path is fine, so check the username, password and database name in MONGODB_URI."
      );
    } else if (network.tcp === true) {
      problems.push(
        "The port opens but the TLS handshake is torn down — the classic signature of an IP missing from the Atlas access list. Confirm 0.0.0.0/0 is listed AND shows as Active, and that it is on the same Atlas project as this cluster."
      );
    } else {
      problems.push(
        "Cannot open a connection to the database host at all — check the cluster is not paused, and that outbound traffic is permitted."
      );
    }
  }

  return NextResponse.json(
    {
      ok: problems.length === 0,
      problems,
      env,
      database,
      network,
      runtime: { node: process.version },
    },
    { status: problems.length === 0 ? 200 : 503 }
  );
}
