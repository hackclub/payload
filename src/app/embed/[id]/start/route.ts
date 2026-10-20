import { NextResponse, type NextRequest } from "next/server";
import { GRANT_TTL_S, grantCookie, redeemTicket } from "@/lib/fiona";

// redirects either way, so the ticket leaves the URL; a spent one lands on the "reopen" page
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sessionId = Number(id);
  const ticket = request.nextUrl.searchParams.get("ticket");
  const grant = Number.isFinite(sessionId) && ticket ? await redeemTicket(ticket, sessionId) : null;

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: `/embed/${encodeURIComponent(id)}`, "Cache-Control": "no-store" },
  });
  if (grant) {
    response.cookies.set(grantCookie(sessionId), grant, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      partitioned: true,
      path: "/",
      maxAge: GRANT_TTL_S,
    });
  }
  return response;
}
