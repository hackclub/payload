import Link from "next/link";
import { Palette } from "lucide-react";
import { getAllowlistedUser } from "@/lib/auth-guard";

export default async function CustomizeButton() {
  const authResult = await getAllowlistedUser();
  if (!authResult) return null;

  return (
    <Link
      href="/customization"
      className="bg-hc-darkless hover:bg-hc-slate/30 text-hc-smoke border border-hc-slate/30 font-bold text-sm px-3 py-1.5 rounded-hc flex items-center gap-2 transition-colors"
    >
      <Palette className="w-4 h-4 text-hc-muted" />
      Customize
    </Link>
  );
}
