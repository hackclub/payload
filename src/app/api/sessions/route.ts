import { NextResponse } from "next/server";
import { getAllowlistedUser } from "@/lib/auth-guard";
import { createUserSession, UserCapError, CapacityError } from "@/lib/sessions";

export async function POST(request: Request) {
  const authResult = await getAllowlistedUser();
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const vmTypeSlug = body.vmTypeSlug ?? "linux";

  try {
    const session = await createUserSession(authResult.userId, vmTypeSlug);
    return NextResponse.json(
      { id: session.id, state: session.state, expiresAt: session.expiresAt, vmTypeSlug },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      error instanceof UserCapError ? 409 : error instanceof CapacityError ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}