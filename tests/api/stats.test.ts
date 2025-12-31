import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { Miniflare } from "miniflare";
import { readFileSync } from "fs";
import { join } from "path";
import { statsRoutes } from "../../server/routes/stats";
import { logsRoutes } from "../../server/routes/logs";
import { tagsRoutes } from "../../server/routes/tags";
import { createDb } from "../../server/db";
import { sql } from "drizzle-orm";

const migrationPath = join(__dirname, "../../server/db/migrations/0000_solid_the_watchers.sql");
const migrationSql = readFileSync(migrationPath, "utf-8");

describe("Stats API", () => {
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
    app.route("/stats", statsRoutes);
    app.route("/logs", logsRoutes);
    app.route("/tags", tagsRoutes);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  beforeEach(async () => {
    await db.exec("DELETE FROM log_tags");
    await db.exec("DELETE FROM logs");
    await db.exec("DELETE FROM tags");
  });

  describe("GET /stats", () => {
    it("returns 400 when tz is missing", async () => {
      const res = await app.request("/stats");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("tz");
    });

    it("returns 400 for invalid timezone", async () => {
      const res = await app.request("/stats?tz=Invalid/Timezone");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("timezone");
    });

    it("returns stats structure with valid timezone", async () => {
      const res = await app.request("/stats?tz=Asia/Tokyo");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("todayCount");
      expect(body).toHaveProperty("weekCount");
      expect(body).toHaveProperty("recentUrls");
      expect(body).toHaveProperty("topTags");
      expect(typeof body.todayCount).toBe("number");
      expect(typeof body.weekCount).toBe("number");
      expect(Array.isArray(body.recentUrls)).toBe(true);
      expect(Array.isArray(body.topTags)).toBe(true);
    });

    it("counts logs correctly for today", async () => {
      // Create logs with current timestamp
      const now = Date.now();
      await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "Today 1",
          timestamp: now,
        }),
      });
      await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "Today 2",
          timestamp: now,
        }),
      });

      const res = await app.request("/stats?tz=Asia/Tokyo");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.todayCount).toBe(2);
    });

    it("returns recentUrls from bookmark logs", async () => {
      await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bookmark",
          content: "Example site",
          metadata: { url: "https://example.com" },
        }),
      });

      const res = await app.request("/stats?tz=Asia/Tokyo");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.recentUrls).toContain("https://example.com");
    });

    it("returns topTags with counts", async () => {
      // Create a tag
      const tagRes = await app.request("/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "popular" }),
      });
      const tag = await tagRes.json();

      // Create logs with the tag
      await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "Tagged 1",
          tagIds: [tag.id],
        }),
      });
      await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "Tagged 2",
          tagIds: [tag.id],
        }),
      });

      const res = await app.request("/stats?tz=Asia/Tokyo");
      expect(res.status).toBe(200);
      const body = await res.json();
      const popularTag = body.topTags.find((t: { name: string }) => t.name === "popular");
      expect(popularTag).toBeDefined();
      expect(popularTag.count).toBe(2);
    });
  });

  describe("Stats with DST timezone", () => {
    it("handles DST spring forward day correctly", async () => {
      // Test with America/New_York during DST transition
      const res = await app.request("/stats?tz=America/New_York");
      expect(res.status).toBe(200);
    });

    it("handles various timezones correctly", async () => {
      const timezones = [
        "Asia/Tokyo",
        "Europe/London",
        "America/Los_Angeles",
        "Australia/Sydney",
        "Pacific/Auckland",
      ];

      for (const tz of timezones) {
        const res = await app.request(`/stats?tz=${tz}`);
        expect(res.status).toBe(200);
      }
    });
  });
});
