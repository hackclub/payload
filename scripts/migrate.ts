import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../src/env";

async function main() {
  // `max: 1` is the postgres-js docs recommendation for a one-shot connection
  // used to run migrations.
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  console.log("Running drizzle migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
