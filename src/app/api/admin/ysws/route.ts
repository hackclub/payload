import { NextResponse } from "next/server";
import { db } from "@/db";
import { ysws, yswsMemberships, vmSessions } from "@/db/schema";
import { desc, eq, inArray, and } from "drizzle-orm";
import { getAdminUser } from "@/lib/admin-guard";

// States that hold (or have promised) RAM, matching the per-workspace cap count
// in createUserSession. Kept in sync with sessions.ts COMMITTED_STATES.
const COMMITTED_STATES = ["pending", "provisioning", "ready", "active"] as const;

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * List workspaces. Superadmins see all; a workspace admin sees only the ones
 * they administer. Each row carries live usage: member count and committed-VM
 * count against the cap (ADR-0036).
 */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = admin.isSuperadmin
    ? await db.select().from(ysws).orderBy(desc(ysws.createdAt))
    : admin.adminYswsIds.length > 0
      ? await db.select().from(ysws).where(inArray(ysws.id, admin.adminYswsIds)).orderBy(desc(ysws.createdAt))
      : [];

  const ids = rows.map((r) => r.id);

  const members = ids.length > 0
    ? await db.select({ yswsId: yswsMemberships.yswsId }).from(yswsMemberships).where(inArray(yswsMemberships.yswsId, ids))
    : [];
  const committed = ids.length > 0
    ? await db
        .select({ yswsId: vmSessions.yswsId })
        .from(vmSessions)
        .where(and(inArray(vmSessions.yswsId, ids), inArray(vmSessions.state, [...COMMITTED_STATES])))
    : [];

  const memberCount = new Map<string, number>();
  for (const m of members) memberCount.set(m.yswsId, (memberCount.get(m.yswsId) ?? 0) + 1);
  const vmCount = new Map<string, number>();
  for (const c of committed) if (c.yswsId) vmCount.set(c.yswsId, (vmCount.get(c.yswsId) ?? 0) + 1);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      enabled: r.enabled,
      maxConcurrentVms: r.maxConcurrentVms,
      memberCount: memberCount.get(r.id) ?? 0,
      activeVms: vmCount.get(r.id) ?? 0,
      createdAt: r.createdAt,
    })),
  );
}

/** Create a workspace. Superadmin only. */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin || !admin.isSuperadmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const cap = parseCap(body.maxConcurrentVms);
  if (cap === "invalid") return NextResponse.json({ error: "Cap must be a positive whole number or blank" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "Slug must be lowercase letters, numbers, and hyphens" }, { status: 400 });

  const existing = await db.query.ysws.findFirst({ where: eq(ysws.slug, slug) });
  if (existing) return NextResponse.json({ error: "A workspace with that slug already exists" }, { status: 409 });

  const [row] = await db.insert(ysws).values({ slug, name, maxConcurrentVms: cap }).returning();
  return NextResponse.json(row, { status: 201 });
}

/** Edit a workspace's name, cap, or enabled flag. Superadmin only. */
export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin || !admin.isSuperadmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Workspace id required" }, { status: 400 });

  const update: { name?: string; maxConcurrentVms?: number | null; enabled?: boolean; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    update.name = name;
  }
  if ("maxConcurrentVms" in body) {
    const cap = parseCap(body.maxConcurrentVms);
    if (cap === "invalid") return NextResponse.json({ error: "Cap must be a positive whole number or blank" }, { status: 400 });
    update.maxConcurrentVms = cap;
  }
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;

  const [row] = await db.update(ysws).set(update).where(eq(ysws.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  return NextResponse.json(row);
}

/** Delete a workspace. Superadmin only. Its VMs keep running but detach (ysws_id set null). */
export async function DELETE(request: Request) {
  const admin = await getAdminUser();
  if (!admin || !admin.isSuperadmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Workspace id required" }, { status: 400 });

  await db.delete(ysws).where(eq(ysws.id, id));
  return NextResponse.json({ ok: true });
}

// Normalize a cap value: blank/null => null (unlimited), positive int => number,
// anything else => "invalid".
function parseCap(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return "invalid";
  return n;
}
