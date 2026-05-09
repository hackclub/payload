import "dotenv/config";
import { db } from "../src/db";
import { reviewerAllowlistEntries } from "../src/db/schema";

async function main() {
  console.log("Seeding allowlist...");
  await db.insert(reviewerAllowlistEntries).values({
    slackId: "U084UQFF0LC"
  }).onConflictDoNothing();
  console.log("Seed complete.");
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
