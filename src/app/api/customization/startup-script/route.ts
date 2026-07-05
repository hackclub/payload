import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllowlistedUser } from "@/lib/auth-guard";
import { MAX_SCRIPT_BYTES } from "@/lib/scripts";

export const runtime = "nodejs";

type Os = "windows" | "linux";
function parseOs(value: unknown): Os | null {
  return value === "windows" || value === "linux" ? value : null;
}

/** Current startup scripts for the reviewer, per OS. */
export async function GET() {
  const authResult = await getAllowlistedUser();
  if (!authResult) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.query.users.findFirst({
    where: eq(users.id, authResult.userId),
    columns: {
      startupScriptWindows: true,
      startupScriptWindowsRunAsAdmin: true,
      startupScriptLinux: true,
      startupScriptLinuxRunAsAdmin: true,
    },
  });

  return NextResponse.json({
    windows: { script: user?.startupScriptWindows ?? "", runAsAdmin: user?.startupScriptWindowsRunAsAdmin ?? true },
    linux: { script: user?.startupScriptLinux ?? "", runAsAdmin: user?.startupScriptLinuxRunAsAdmin ?? true },
  });
}

/** Save one OS's startup script. Body: { os, script, runAsAdmin }. Empty script clears it. */
export async function PUT(request: Request) {
  const authResult = await getAllowlistedUser();
  if (!authResult) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const os = parseOs((body as { os?: unknown } | null)?.os);
  if (!os) return NextResponse.json({ error: "Invalid os" }, { status: 400 });

  const rawScript = (body as { script?: unknown }).script;
  const script = typeof rawScript === "string" ? rawScript : "";
  if (Buffer.byteLength(script, "utf8") > MAX_SCRIPT_BYTES) {
    return NextResponse.json({ error: "Script is too large (max 256 KB)" }, { status: 413 });
  }
  const runAsAdmin = (body as { runAsAdmin?: unknown }).runAsAdmin !== false;
  const stored = script.trim().length > 0 ? script : null;

  await db
    .update(users)
    .set(
      os === "windows"
        ? { startupScriptWindows: stored, startupScriptWindowsRunAsAdmin: runAsAdmin }
        : { startupScriptLinux: stored, startupScriptLinuxRunAsAdmin: runAsAdmin },
    )
    .where(eq(users.id, authResult.userId));

  return NextResponse.json({ ok: true });
}
