import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllowlistedUser } from "@/lib/auth-guard";
import WallpaperUploader from "@/components/WallpaperUploader";

export default async function CustomizationPage() {
  const authResult = await getAllowlistedUser();
  if (!authResult) redirect("/");

  const user = await db.query.users.findFirst({
    where: eq(users.id, authResult.userId),
    columns: { wallpaperUpdatedAt: true },
  });

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div>
        <Link href="/" className="text-hc-cyan hover:underline text-sm">← Back to sessions</Link>
        <h1 className="text-4xl font-bold mt-3 mb-2 text-hc-snow">Customization</h1>
        <p className="text-hc-muted text-lg">
          Personalize the VMs you launch. Changes apply to new sessions.
        </p>
      </div>

      <section className="bg-hc-dark rounded-hc border border-hc-darkless p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-hc-snow mb-1">Desktop wallpaper</h2>
        <p className="text-hc-muted mb-6">
          Your wallpaper is applied automatically to Windows, Linux, and macOS VMs
          shortly after they start — you can connect right away while it loads in
          the background.
        </p>
        <WallpaperUploader hasWallpaper={!!user?.wallpaperUpdatedAt} />
      </section>
    </div>
  );
}
