import { getAdminUser } from "@/lib/admin-guard";
import { redirect } from "next/navigation";
import AdminDashboard from "./AdminDashboard";

export default async function AdminPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/");

  return <AdminDashboard isSuperadmin={admin.isSuperadmin} />;
}
