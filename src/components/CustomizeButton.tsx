import Link from "next/link";
import { Palette } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllowlistedUser } from "@/lib/auth-guard";

export default async function CustomizeButton() {
  const authResult = await getAllowlistedUser();
  if (!authResult) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, authResult.userId),
    columns: { customizationSeenAt: true },
  });
  // Highlight the border until the reviewer has opened the customization page.
  const isNew = !user?.customizationSeenAt;

  return (
    <Link
      href="/customization"
      className={`bg-hc-darkless hover:bg-hc-slate/30 text-hc-smoke border font-bold text-sm px-3 py-1.5 rounded-hc flex items-center gap-2 transition-colors ${
        isNew ? "border-hc-red" : "border-hc-slate/30"
      }`}
    >
      <Palette className="w-4 h-4 text-hc-muted" />
      Customize
    </Link>
  );
}
