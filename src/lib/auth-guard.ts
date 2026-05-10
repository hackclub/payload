import { auth } from "@/auth";
import { db } from "@/db";
import { reviewerAllowlistEntries } from "@/db/schema";
import { eq } from "drizzle-orm";

type UserWithSlackId = {
  slackId?: string | null;
};

export async function getAllowlistedUser() {
  const session = await auth();
  if (!session?.user) return null;

  const slackId = (session.user as UserWithSlackId).slackId;
  if (!slackId) return null;

  const allowlistEntry = await db.query.reviewerAllowlistEntries.findFirst({
    where: eq(reviewerAllowlistEntries.slackId, slackId),
  });

  if (!allowlistEntry) return null;

  return { session, user: session.user, userId: session.user.id ?? "", slackId };
}

export type AllowlistedUser = NonNullable<Awaited<ReturnType<typeof getAllowlistedUser>>>;