import { auth } from "@/auth";
import { db } from "@/db";
import { adminEntries } from "@/db/schema";
import { eq } from "drizzle-orm";

type UserWithSlackId = {
  slackId?: string | null;
};

export async function getAdminUser() {
  const session = await auth();
  if (!session?.user) return null;

  const slackId = (session.user as UserWithSlackId).slackId;
  if (!slackId) return null;

  const adminEntry = await db.query.adminEntries.findFirst({
    where: eq(adminEntries.slackId, slackId),
  });

  if (!adminEntry) return null;

  return { session, user: session.user, userId: session.user.id ?? "", slackId };
}

export type AdminUser = NonNullable<Awaited<ReturnType<typeof getAdminUser>>>;
