import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllowlistedUser } from "@/lib/auth-guard";
import WallpaperUploader from "@/components/WallpaperUploader";
import ProgramsSelector from "@/components/ProgramsSelector";
import StartupScriptEditor from "@/components/StartupScriptEditor";
import CustomizationTabs from "@/components/CustomizationTabs";
import RefreshOnMount from "@/components/RefreshOnMount";

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
      customizationSeenAt: true,
    },
  });

  // Mark customization as discovered on first visit so the nav button stops
  // highlighting itself. Refresh the layout so the nav updates without a manual
  // reload (see RefreshOnMount below).
  const justMarkedSeen = !!user && !user.customizationSeenAt;
  if (justMarkedSeen) {
    await db
      .update(users)
      .set({ customizationSeenAt: new Date() })
      .where(eq(users.id, authResult.userId));
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {justMarkedSeen && <RefreshOnMount />}
      <div>
        <h1 className="text-4xl font-bold mb-2 text-hc-snow">Customization</h1>
        <p className="text-hc-muted text-lg">
          Personalize your Windows and Linux VMs !
        </p>
      </div>

      <CustomizationTabs
        programs={
          <section>
            <h2 className="text-2xl font-bold text-hc-snow mb-1">Programs</h2>
            <p className="text-hc-muted mb-6">
              Selected apps will auto install on each new VM you start
            </p>
            <ProgramsSelector
              initial={{
                windows: user?.installPackagesWindows ?? [],
                linux: user?.installPackagesLinux ?? [],
              }}
            />
          </section>
        }
        wallpaper={
          <section>
            <h2 className="text-2xl font-bold text-hc-snow mb-1">Desktop wallpaper</h2>
            <p className="text-hc-muted mb-6">
            </p>
            <WallpaperUploader hasWallpaper={!!user?.wallpaperUpdatedAt} />
          </section>
        }
        startup={
          <section>
            <h2 className="text-2xl font-bold text-hc-snow mb-1">Startup script</h2>
            <p className="text-hc-muted mb-6">
              A script that runs on every VM you start
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
        }
      />
    </div>
  );
}
