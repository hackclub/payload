import { auth } from "@/auth";
import Link from "next/link";
import { db } from "@/db";
import { adminEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Settings } from "lucide-react";

type UserWithSlackId = {
  slackId?: string | null;
};

export default async function AdminButton() {
  const session = await auth();
  if (!session?.user) return null;

  const slackId = (session.user as UserWithSlackId).slackId;
  if (!slackId) return null;

  const isAdmin = await db.query.adminEntries.findFirst({
    where: eq(adminEntries.slackId, slackId),
  });

  if (!isAdmin) return null;

  return (
    <Link
      href="/admin"
      className="bg-hc-darkless hover:bg-hc-slate/30 text-hc-smoke border border-hc-slate/30 font-bold text-sm px-3 py-1.5 rounded-hc flex items-center gap-2 transition-colors"
    >
      <Settings className="w-4 h-4 text-hc-muted" />
      Admin
    </Link>
  );
}