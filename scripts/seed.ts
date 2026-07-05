import "dotenv/config";
import { db } from "../src/db";
import { vmTypeSeeds } from "../src/config/vm-types";
import { vmTypes, ysws, yswsMemberships, platformSuperadmins } from "../src/db/schema";

const SEED_SLACK_ID = "U084UQFF0LC";
// Matches the Legacy workspace id created by migration 0011's data backfill, so
// re-seeding after a migration stays idempotent (ADR-0036).
const LEGACY_YSWS_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  console.log("Seeding default workspace...");
  await db
    .insert(ysws)
    .values({ id: LEGACY_YSWS_ID, slug: "legacy", name: "Legacy" })
    .onConflictDoNothing();

  console.log("Seeding platform superadmin...");
  await db
    .insert(platformSuperadmins)
    .values({ slackId: SEED_SLACK_ID })
    .onConflictDoNothing();

  console.log("Seeding workspace membership...");
  await db
    .insert(yswsMemberships)
    .values({ yswsId: LEGACY_YSWS_ID, slackId: SEED_SLACK_ID, role: "admin" })
    .onConflictDoNothing();

  console.log("Seeding VM types...");
  for (const vmType of vmTypeSeeds) {
    await db
      .insert(vmTypes)
      .values(vmType)
      .onConflictDoUpdate({
        target: vmTypes.slug,
        set: {
          displayName: vmType.displayName,
          proxmoxTemplateVmid: vmType.proxmoxTemplateVmid,
          proxmoxNode: vmType.proxmoxNode,
          protocol: vmType.protocol,
          defaultPort: vmType.defaultPort,
          enabled: vmType.enabled,
          description: vmType.description,
          username: vmType.username,
          password: vmType.password,
          iconUrl: vmType.iconUrl,
          bootDelayMs: vmType.bootDelayMs,
          warmPoolSize: vmType.warmPoolSize,
          memoryMb: vmType.memoryMb,
          expensive: vmType.expensive,
        },
      });
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
