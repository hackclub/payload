import "dotenv/config";
import { db } from "../src/db";
import { vmTypeSeeds } from "../src/config/vm-types";
import { reviewerAllowlistEntries, vmTypes, adminEntries } from "../src/db/schema";

async function main() {
  console.log("Seeding allowlist...");
  await db
    .insert(reviewerAllowlistEntries)
    .values({
      slackId: "U084UQFF0LC",
    })
    .onConflictDoNothing();

  console.log("Seeding admins...");
  await db
    .insert(adminEntries)
    .values({
      slackId: "U084UQFF0LC",
    })
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
