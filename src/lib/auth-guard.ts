import { getAccessContext, type AccessContext } from "@/lib/access";
import { embedUserId } from "@/lib/fiona";

/**
 * Gate for anything a reviewer does with VMs. A user may use Payload iff they
 * belong to at least one enabled workspace, which means they have an active
 * one resolved (ADR-0036, supersedes the flat allowlist of ADR-0005).
 *
 * Returns the resolved user plus their active workspace id, which callers stamp
 * onto the VMs they create.
 */
export async function getAllowlistedUser() {
  const ctx = await getAccessContext();
  if (!ctx || !ctx.activeYsws) return null;

  return {
    userId: ctx.userId,
    slackId: ctx.slackId,
    activeYswsId: ctx.activeYsws.id,
    ctx,
  };
}

export type AllowlistedUser = NonNullable<Awaited<ReturnType<typeof getAllowlistedUser>>>;

// fiona's embed cookie for this VM, or a signed-in member; callers still check the VM is theirs
export async function getSessionUserId(sessionId: number): Promise<string | null> {
  return (await embedUserId(sessionId)) ?? (await getAllowlistedUser())?.userId ?? null;
}

export type { AccessContext };
