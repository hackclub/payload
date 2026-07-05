import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllowlistedUser } from "@/lib/auth-guard";
import WallpaperUploader from "@/components/WallpaperUploader";
import ProgramsSelector from "@/components/ProgramsSelector";
import StartupScriptEditor from "@/components/StartupScriptEditor";

export default async function CustomizationPage() {
  const authResult = await getAllowlistedUser();
  if (!authResult) redirect("/");

  const user = await db.query.users.findFirst({
    where: eq(users.id, authResult.userId),
    columns: {
      wallpaperUpdatedAt: true,
      installPackagesWindows: true,
      installPackagesLinux: true,
      startupScriptWindows: true,
      startupScriptWindowsRunAsAdmin: true,
      startupScriptLinux: true,
      startupScriptLinuxRunAsAdmin: true,
    },
  });

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div>
        <Link href="/" className="text-hc-cyan hover:underline text-sm">← Back to sessions</Link>
        <h1 className="text-4xl font-bold mt-3 mb-2 text-hc-snow">Customization</h1>
        <p className="text-hc-muted text-lg">
          Personalize the Windows and Linux VMs you launch. Changes apply to new
          sessions in the background — you can connect right away.
        </p>
      </div>

      <section className="bg-hc-dark rounded-hc border border-hc-darkless p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-hc-snow mb-1">Desktop wallpaper</h2>
        <p className="text-hc-muted mb-6">
          Applied automatically to Windows and Linux VMs shortly after they start.
        </p>
        <WallpaperUploader hasWallpaper={!!user?.wallpaperUpdatedAt} />
      </section>

      <section className="bg-hc-dark rounded-hc border border-hc-darkless p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-hc-snow mb-1">Programs</h2>
        <p className="text-hc-muted mb-6">
          Pick from common apps or add any package by name (Chocolatey on Windows,
          apt on Linux). They&apos;re installed automatically after the VM starts.
        </p>
        <ProgramsSelector
          initial={{
            windows: user?.installPackagesWindows ?? [],
            linux: user?.installPackagesLinux ?? [],
          }}
        />
      </section>

      <section className="bg-hc-dark rounded-hc border border-hc-darkless p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-hc-snow mb-1">Startup script</h2>
        <p className="text-hc-muted mb-6">
          A script that runs on every VM you start. Choose whether it runs with
          full administrator privileges or inside your desktop session.
        </p>
        <StartupScriptEditor
          initial={{
            windows: {
              script: user?.startupScriptWindows ?? "",
              runAsAdmin: user?.startupScriptWindowsRunAsAdmin ?? true,
            },
            linux: {
              script: user?.startupScriptLinux ?? "",
              runAsAdmin: user?.startupScriptLinuxRunAsAdmin ?? true,
            },
          }}
        />
      </section>
    </div>
  );
}
