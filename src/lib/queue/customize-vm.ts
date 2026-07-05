import { db } from "@/db";
import { vmSessions, vmSessionEvents, vmTypes, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createProxmoxClient, getProxmoxConfig } from "@/lib/proxmox/config";
import { applyWallpaper, wallpaperSupported } from "@/lib/wallpaper";

type CustomizeJobData = { sessionId: number };

/**
 * Background customization pass (ADR-0034). Runs after a session is `ready` and
 * the reviewer can already connect — applies the owner's saved wallpaper into
 * the running VM via the guest agent. Never touches session state; failure is
 * logged and left to BullMQ retries, then dropped.
 */
export async function processCustomizeVm(jobData: CustomizeJobData) {
  const { sessionId } = jobData;

  const session = await db.query.vmSessions.findFirst({
    where: eq(vmSessions.id, sessionId),
  });
  if (!session) return;

  // Only meaningful once the VM exists and is (or was) connectable.
  if (!session.userId || !session.proxmoxVmid || !session.proxmoxNode) return;
  if (!["ready", "active"].includes(session.state)) return;

  const [vmType, user] = await Promise.all([
    db.query.vmTypes.findFirst({ where: eq(vmTypes.id, session.vmTypeId) }),
    db.query.users.findFirst({ where: eq(users.id, session.userId) }),
  ]);

  if (!vmType || !user?.wallpaperImage) return; // nothing to customize
  if (!wallpaperSupported(vmType.slug)) return;

  const proxmox = createProxmoxClient(getProxmoxConfig());

  try {
    await applyWallpaper({
      proxmox,
      node: session.proxmoxNode,
      vmid: session.proxmoxVmid,
      osSlug: vmType.slug,
      sessionId,
      image: Buffer.from(user.wallpaperImage),
    });
    await db.insert(vmSessionEvents).values({
      vmSessionId: sessionId,
      kind: "wallpaper_applied",
    });
  } catch (error) {
    await db.insert(vmSessionEvents).values({
      vmSessionId: sessionId,
      kind: "wallpaper_failed",
      payload: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error; // let BullMQ retry per the job's attempts policy
  }
}
