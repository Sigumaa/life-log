import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { Miniflare } from "miniflare";
import { readFileSync } from "fs";
import { join } from "path";
import { searchRoutes } from "../../server/routes/search";
import { logsRoutes } from "../../server/routes/logs";
import { createDb } from "../../server/db";
import { sql } from "drizzle-orm";

const migrationPath = join(__dirname, "../../server/db/migrations/0000_solid_the_watchers.sql");
const migrationSql = readFileSync(migrationPath, "utf-8");

describe("Search API", () => {
  let mf: Miniflare;
  let db: D1Database;
  let app: Hono;

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: `export default { async fetch() { return new Response("OK"); } }`,
      d1Databases: ["DB"],
    });

    db = await mf.getD1Database("DB");

    // Apply migrations using batch + prepare (D1's exec() doesn't handle multi-line SQL)
    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const preparedStatements = statements.map((s) => db.prepare(s));
    await db.batch(preparedStatements);

    app = new Hono();
    app.use("*", async (c, next) => {
      const drizzleDb = createDb(db);
      await drizzleDb.run(sql`PRAGMA foreign_keys = ON`);
      c.set("db" as never, drizzleDb);
      return next();
    });
    app.route("/search", searchRoutes);
    app.route("/logs", logsRoutes);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  beforeEach(async () => {
    await db.exec("DELETE FROM log_tags");
    await db.exec("DELETE FROM logs");
    await db.exec("DELETE FROM tags");
  });

  describe("GET /search", () => {
    it("returns 400 when q is missing", async () => {
      const res = await app.request("/search?tz=Asia/Tokyo");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("q");
    });

    it("returns 400 when q is less than 2 characters", async () => {
      const res = await app.request("/search?q=a&tz=Asia/Tokyo");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("2 characters");
    });

    it("returns 400 when tz is missing", async () => {
      const res = await app.request("/search?q=test");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("tz");
    });

    it("returns 400 for invalid timezone", async () => {
      const res = await app.request("/search?q=test&tz=Invalid/Timezone");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("timezone");
    });

    it("returns 400 for invalid date format", async () => {
      const res = await app.request("/search?q=test&tz=Asia/Tokyo&date=2025-1-1");
      expect(res.status).toBe(400);
    });

    it("returns 400 for non-existent date", async () => {
      const res = await app.request("/search?q=test&tz=Asia/Tokyo&date=2025-02-31");
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid type", async () => {
      const res = await app.request("/search?q=test&tz=Asia/Tokyo&type=invalid");
      expect(res.status).toBe(400);
    });

    it("searches logs by content", async () => {
      // Create logs
      await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "Hello world",
          timestamp: Date.now(),
        }),
      });
      await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "Goodbye world",
          timestamp: Date.now(),
        }),
      });

      const res = await app.request("/search?q=Hello&tz=Asia/Tokyo");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items.length).toBe(1);
      expect(body.items[0].content).toContain("Hello");
    });

    it("filters by type", async () => {
      await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "Test thought",
          timestamp: Date.now(),
        }),
      });
      await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "meal",
          content: "Test meal",
          timestamp: Date.now(),
        }),
      });

      const res = await app.request("/search?q=Test&tz=Asia/Tokyo&type=thought");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items.length).toBe(1);
      expect(body.items[0].type).toBe("thought");
    });

    it("escapes LIKE special characters", async () => {
      await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "100% complete",
          timestamp: Date.now(),
        }),
      });

      // Search for literal %
      const res = await app.request("/search?q=100%25&tz=Asia/Tokyo");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items.length).toBe(1);
    });

    it("limits results to 50", async () => {
      // Create 60 logs
      for (let i = 0; i < 60; i++) {
        await app.request("/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "thought",
            content: `Test log ${i}`,
            timestamp: Date.now(),
          }),
        });
      }

      const res = await app.request("/search?q=Test&tz=Asia/Tokyo");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items.length).toBe(50);
    });
  });
});
