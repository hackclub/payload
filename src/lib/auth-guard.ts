import { getAccessContext, type AccessContext } from "@/lib/access";

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

export type { AccessContext };
