import Link from "next/link";
import { getAdminUser } from "@/lib/admin-guard";
import { Settings } from "lucide-react";

export default async function AdminButton() {
  // Visible to platform superadmins and workspace admins alike (ADR-0036).
  const admin = await getAdminUser();
  if (!admin) return null;

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
