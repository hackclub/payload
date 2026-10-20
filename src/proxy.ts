import { NextResponse } from "next/server";
import { fionaOrigins } from "@/lib/fiona-origins";

export function proxy() {
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", `frame-ancestors 'self' ${fionaOrigins.join(" ")}`);
  return response;
}

export const config = {
  matcher: "/embed/:path*",
};
