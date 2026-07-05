import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllowlistedUser } from "@/lib/auth-guard";
import { processWallpaperUpload, WALLPAPER_MAX_UPLOAD_BYTES } from "@/lib/wallpaper";

// sharp is a native module — force the Node.js runtime (not Edge).
export const runtime = "nodejs";

/** Upload / replace the reviewer's wallpaper. */
export async function POST(request: Request) {
  const authResult = await getAllowlistedUser();
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > WALLPAPER_MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image is too large (max 15 MB)" }, { status: 413 });
  }

  const processed = await processWallpaperUpload(Buffer.from(await file.arrayBuffer()));
  if (!processed) {
    return NextResponse.json({ error: "Could not read that image" }, { status: 400 });
  }

  await db
    .update(users)
    .set({
      wallpaperImage: processed.data,
      wallpaperMime: processed.mime,
      wallpaperUpdatedAt: new Date(),
    })
    .where(eq(users.id, authResult.userId));

  return NextResponse.json({ ok: true });
}

/** Remove the reviewer's wallpaper (revert to template default on new VMs). */
export async function DELETE() {
  const authResult = await getAllowlistedUser();
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .update(users)
    .set({ wallpaperImage: null, wallpaperMime: null, wallpaperUpdatedAt: null })
    .where(eq(users.id, authResult.userId));

  return NextResponse.json({ ok: true });
}

/** Serve the reviewer's current wallpaper (for the preview on the settings page). */
export async function GET() {
  const authResult = await getAllowlistedUser();
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, authResult.userId),
    columns: { wallpaperImage: true, wallpaperMime: true },
  });

  if (!user?.wallpaperImage) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(user.wallpaperImage), {
    status: 200,
    headers: {
      "content-type": user.wallpaperMime ?? "image/jpeg",
      "cache-control": "no-store",
    },
  });
}
