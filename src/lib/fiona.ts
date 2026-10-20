import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, platformSuperadmins, users, ysws, yswsMemberships } from "@/db/schema";
import { env } from "@/env";
import { SESSION_LIFETIME_MS } from "@/lib/queue";
import { redis } from "@/lib/redis";
import { advisoryLockKey } from "@/lib/sessions";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

const TICKET_TTL_S = 60;
const ticketKey = (ticket: string) => `embed:ticket:${sha256(ticket).toString("hex")}`;
const grantKey = (grant: string) => `embed:grant:${sha256(grant).toString("hex")}`;
export const grantCookie = (sessionId: number) => `payload_embed_${sessionId}`;
export const GRANT_TTL_S = Math.ceil(SESSION_LIFETIME_MS / 1000);

export const LIVE_STATES = ["pending", "provisioning", "ready", "active"] as const;

export const fionaError = (status: number, code: string, error: string) => NextResponse.json({ error, code }, { status });

export function fionaCaller(request: Request): string | NextResponse {
  const key = env.FIONA_API_KEY;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!key || !timingSafeEqual(sha256(given), sha256(key))) {
    return fionaError(401, "unauthorized", "Unauthorized");
  }
  const slackId = request.headers.get("x-slack-id") ?? "";
  if (!/^[UW][A-Z0-9]{2,20}$/.test(slackId)) {
    return fionaError(400, "bad_slack_id", "Missing or malformed X-Slack-Id");
  }
  return slackId;
}

export async function fionaWorkspace(slackId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: ysws.id, member: yswsMemberships.slackId, superadmin: platformSuperadmins.slackId })
    .from(ysws)
    .leftJoin(yswsMemberships, and(eq(yswsMemberships.yswsId, ysws.id), eq(yswsMemberships.slackId, slackId)))
    .leftJoin(platformSuperadmins, eq(platformSuperadmins.slackId, slackId))
    .where(and(eq(ysws.slug, env.FIONA_WORKSPACE), eq(ysws.enabled, true)))
    .limit(1);
  return row && (row.member || row.superadmin) ? row.id : null;
}

// slack_id isn't unique: a row someone signed in with beats one fiona made
export async function payloadUserId(slackId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .leftJoin(accounts, eq(accounts.userId, users.id))
    .where(eq(users.slackId, slackId))
    .orderBy(sql`${accounts.userId} IS NULL`, asc(users.id))
    .limit(1);
  return row?.id ?? null;
}

export async function ensurePayloadUser(slackId: string, name: string | null, image: string | null): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${advisoryLockKey(`slack:${slackId}`)})`);
    const found = await payloadUserId(slackId);
    if (found) return found;
    // no email, so Auth.js can't link it by email; src/auth.ts claims it by Slack ID
    const [row] = await tx.insert(users).values({ slackId, name, image }).returning({ id: users.id });
    return row.id;
  });
}

export async function issueTicket(sessionId: number, userId: string): Promise<string> {
  const ticket = randomBytes(32).toString("base64url");
  await redis.set(ticketKey(ticket), `${sessionId}:${userId}`, "EX", TICKET_TTL_S);
  return ticket;
}

export async function redeemTicket(ticket: string, sessionId: number): Promise<string | null> {
  const owner = parseOwner(await redis.getdel(ticketKey(ticket)), sessionId);
  if (!owner) return null;
  const grant = randomBytes(32).toString("base64url");
  await redis.set(grantKey(grant), `${sessionId}:${owner}`, "EX", GRANT_TTL_S);
  return grant;
}

export async function embedUserId(sessionId: number): Promise<string | null> {
  const grant = (await cookies()).get(grantCookie(sessionId))?.value;
  if (!grant) return null;
  return parseOwner(await redis.get(grantKey(grant)), sessionId);
}

function parseOwner(value: string | null, sessionId: number): string | null {
  if (!value) return null;
  const split = value.indexOf(":");
  if (Number(value.slice(0, split)) !== sessionId) return null;
  return value.slice(split + 1) || null;
}
