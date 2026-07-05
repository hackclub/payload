import { getAccessContext, adminYswsIds } from "@/lib/access";

/**
 * Gate for the admin panel and its APIs. Passes for a platform superadmin or
 * any workspace admin. `adminYswsIds` scopes what a non-superadmin may see and
 * manage; superadmins get every enabled workspace (ADR-0036).
 */
export async function getAdminUser() {
  const ctx = await getAccessContext();
  if (!ctx) return null;

  const yswsIds = adminYswsIds(ctx);
  if (!ctx.isSuperadmin && yswsIds.length === 0) return null;

  return {
    userId: ctx.userId,
    slackId: ctx.slackId,
    isSuperadmin: ctx.isSuperadmin,
    adminYswsIds: yswsIds,
    ctx,
  };
}

export type AdminUser = NonNullable<Awaited<ReturnType<typeof getAdminUser>>>;
