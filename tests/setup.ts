import { Miniflare } from "miniflare";
import { readFileSync } from "fs";
import { join } from "path";

// Read migration SQL
const migrationPath = join(__dirname, "../server/db/migrations/0000_solid_the_watchers.sql");
const migrationSql = readFileSync(migrationPath, "utf-8");

export async function createTestMiniflare() {
  const mf = new Miniflare({
    modules: true,
    script: `
      export default {
        async fetch() {
          return new Response("OK");
        }
      }
    `,
    d1Databases: ["DB"],
  });

  // Get D1 database and apply migrations
  const db = await mf.getD1Database("DB");

  // Split migration by statement breakpoints and execute using batch + prepare
  // Note: D1's exec() doesn't handle multi-line SQL, so we use batch() instead
  const statements = migrationSql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const preparedStatements = statements.map((s) => db.prepare(s));
  await db.batch(preparedStatements);

  // Enable foreign keys
  await db.batch([db.prepare("PRAGMA foreign_keys = ON")]);

  return { mf, db };
}

export async function cleanupTestDb(db: D1Database) {
  // Clean up tables in reverse order (respecting foreign keys)
  await db.exec("DELETE FROM log_tags");
  await db.exec("DELETE FROM logs");
  await db.exec("DELETE FROM tags");
}
