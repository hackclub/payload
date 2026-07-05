import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllowlistedUser } from "@/lib/auth-guard";
import { sanitizePackages } from "@/lib/installs";

export const runtime = "nodejs";

/** Current package selections for the reviewer, per OS. */
export async function GET() {
  const authResult = await getAllowlistedUser();
  if (!authResult) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.query.users.findFirst({
    where: eq(users.id, authResult.userId),
    columns: { installPackagesWindows: true, installPackagesLinux: true },
  });

  return NextResponse.json({
    windows: user?.installPackagesWindows ?? [],
    linux: user?.installPackagesLinux ?? [],
  });
}

/** Replace the reviewer's package selections. Body: { windows: string[], linux: string[] }. */
export async function PUT(request: Request) {
  const authResult = await getAllowlistedUser();
  if (!authResult) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const windows = sanitizePackages((body as { windows?: unknown }).windows);
  const linux = sanitizePackages((body as { linux?: unknown }).linux);

  await db
    .update(users)
    .set({ installPackagesWindows: windows, installPackagesLinux: linux })
    .where(eq(users.id, authResult.userId));

  return NextResponse.json({ ok: true, windows, linux });
}
