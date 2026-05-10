import { db } from "@/db";
import { vmSessions, vmSessionEvents, vmTypes } from "@/db/schema";
import { eq, inArray, and, sql } from "drizzle-orm";
import { enqueueProvisionVm, MAX_SESSIONS_PER_USER, SESSION_LIFETIME_MS } from "@/lib/queue";
import { createHash } from "node:crypto";

export async function createUserSession(userId: string, vmTypeSlug: string) {
  const vmType = await db.query.vmTypes.findFirst({
    where: and(eq(vmTypes.slug, vmTypeSlug), eq(vmTypes.enabled, true)),
  });

  if (!vmType) {
    throw new Error("VM type not found or not enabled");
  }

  const lockKey = advisoryLockKey(userId);
  await db.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

  const activeCount = await db.query.vmSessions.findMany({
    where: and(
      eq(vmSessions.userId, userId),
      inArray(vmSessions.state, ["pending", "provisioning", "ready", "active"]),
    ),
  });

  if (activeCount.length >= MAX_SESSIONS_PER_USER) {
    throw new Error(`You already have ${MAX_SESSIONS_PER_USER} active sessions`);
  }

  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

  const [inserted] = await db
    .insert(vmSessions)
    .values({
      userId,
      vmTypeId: vmType.id,
      expiresAt,
    })
    .returning();

  await db.insert(vmSessionEvents).values({
    vmSessionId: inserted.id,
    kind: "created",
    payload: { vmTypeSlug },
  });

  await enqueueProvisionVm({ sessionId: inserted.id });

  return inserted;
}

function advisoryLockKey(userId: string): bigint {
  const hash = createHash("md5").update(userId).digest("hex");
  return BigInt("0x" + hash.slice(0, 15));
}