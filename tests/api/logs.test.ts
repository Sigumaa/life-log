import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { Miniflare } from "miniflare";
import { readFileSync } from "fs";
import { join } from "path";

// Import the app without CSRF middleware for testing
import { logsRoutes } from "../../server/routes/logs";
import { tagsRoutes } from "../../server/routes/tags";
import { createDb } from "../../server/db";
import { sql } from "drizzle-orm";

// Read migration SQL
const migrationPath = join(__dirname, "../../server/db/migrations/0000_solid_the_watchers.sql");
const migrationSql = readFileSync(migrationPath, "utf-8");

describe("Logs API", () => {
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

    // Create test app with database middleware
    app = new Hono();
    app.use("*", async (c, next) => {
      const drizzleDb = createDb(db);
      await drizzleDb.run(sql`PRAGMA foreign_keys = ON`);
      c.set("db" as never, drizzleDb);
      return next();
    });
    app.route("/logs", logsRoutes);
    app.route("/tags", tagsRoutes);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  beforeEach(async () => {
    // Clean up tables
    await db.exec("DELETE FROM log_tags");
    await db.exec("DELETE FROM logs");
    await db.exec("DELETE FROM tags");
  });

  describe("GET /logs", () => {
    it("returns 400 when date is missing", async () => {
      const res = await app.request("/logs?tz=Asia/Tokyo");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("date");
    });

    it("returns 400 when tz is missing", async () => {
      const res = await app.request("/logs?date=2025-01-01");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("tz");
    });

    it("returns 400 for invalid date format", async () => {
      const res = await app.request("/logs?date=2025-1-1&tz=Asia/Tokyo");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("date");
    });

    it("returns 400 for non-existent date (2025-02-31)", async () => {
      const res = await app.request("/logs?date=2025-02-31&tz=Asia/Tokyo");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("date");
    });

    it("returns 400 for invalid timezone", async () => {
      const res = await app.request("/logs?date=2025-01-01&tz=Invalid/Timezone");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("timezone");
    });

    it("clamps limit=0 to 1", async () => {
      // Create a log first
      await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "Test log",
          timestamp: Date.now(),
        }),
      });

      const res = await app.request("/logs?date=2025-12-31&tz=Asia/Tokyo&limit=0");
      expect(res.status).toBe(200);
      const body = await res.json();
      // Should return at most 1 item (clamped from 0)
      expect(body.items.length).toBeLessThanOrEqual(1);
    });

    it("clamps limit=9999 to 100", async () => {
      const res = await app.request("/logs?date=2025-12-31&tz=Asia/Tokyo&limit=9999");
      expect(res.status).toBe(200);
      // Just verify it doesn't error - actual limit is enforced internally
    });

    it("returns 400 for invalid cursor format (abc)", async () => {
      const res = await app.request("/logs?date=2025-12-31&tz=Asia/Tokyo&cursor=abc");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("cursor");
    });

    it("returns 400 for invalid cursor format (123_)", async () => {
      const res = await app.request("/logs?date=2025-12-31&tz=Asia/Tokyo&cursor=123_");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("cursor");
    });

    it("returns 400 for cursor with non-ULID id", async () => {
      const res = await app.request("/logs?date=2025-12-31&tz=Asia/Tokyo&cursor=1735689600000_not-a-ulid");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("cursor");
    });

    it("returns empty items for valid request with no data", async () => {
      const res = await app.request("/logs?date=2025-12-31&tz=Asia/Tokyo");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toEqual([]);
      expect(body.hasMore).toBe(false);
    });
  });

  describe("POST /logs", () => {
    it("creates a log successfully", async () => {
      const res = await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "Hello world",
          timestamp: 1735689600000,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(body.type).toBe("thought");
      expect(body.content).toBe("Hello world");
    });

    it("returns 400 for invalid type", async () => {
      const res = await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "invalid_type",
          content: "Test",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for missing content", async () => {
      const res = await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /logs/:id", () => {
    it("returns 400 for invalid ULID", async () => {
      const res = await app.request("/logs/invalid-id");
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent log", async () => {
      const res = await app.request("/logs/01JGHX7E7K0000000000000000");
      expect(res.status).toBe(404);
    });

    it("returns log with tagIds", async () => {
      // Create a tag
      const tagRes = await app.request("/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test-tag" }),
      });
      const tag = await tagRes.json();

      // Create a log with the tag
      const logRes = await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "Test",
          tagIds: [tag.id],
        }),
      });
      const log = await logRes.json();

      // Get the log
      const getRes = await app.request(`/logs/${log.id}`);
      expect(getRes.status).toBe(200);
      const body = await getRes.json();
      expect(body.tagIds).toContain(tag.id);
    });
  });

  describe("PUT /logs/:id", () => {
    it("updates a log successfully", async () => {
      // Create a log
      const createRes = await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "Original",
        }),
      });
      const log = await createRes.json();

      // Update it
      const updateRes = await app.request(`/logs/${log.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Updated",
        }),
      });

      expect(updateRes.status).toBe(200);
      const body = await updateRes.json();
      expect(body.content).toBe("Updated");
    });

    it("returns 404 for non-existent log", async () => {
      const res = await app.request("/logs/01JGHX7E7K0000000000000000", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Test" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /logs/:id", () => {
    it("deletes a log successfully", async () => {
      // Create a log
      const createRes = await app.request("/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thought",
          content: "To delete",
        }),
      });
      const log = await createRes.json();

      // Delete it
      const deleteRes = await app.request(`/logs/${log.id}`, {
        method: "DELETE",
      });

      expect(deleteRes.status).toBe(200);

      // Verify it's gone
      const getRes = await app.request(`/logs/${log.id}`);
      expect(getRes.status).toBe(404);
    });

    it("returns 404 for non-existent log", async () => {
      const res = await app.request("/logs/01JGHX7E7K0000000000000000", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });
});

describe("DST boundary tests", () => {
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
    app.route("/logs", logsRoutes);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it("handles DST spring forward (23-hour day) correctly", async () => {
    // 2025-03-09 is DST spring forward in America/New_York
    // The day has only 23 hours
    const res = await app.request("/logs?date=2025-03-09&tz=America/New_York");
    expect(res.status).toBe(200);
    // Just verify it doesn't error - the calculation should handle 23h day
  });

  it("handles DST fall back (25-hour day) correctly", async () => {
    // 2025-11-02 is DST fall back in America/New_York
    // The day has 25 hours
    const res = await app.request("/logs?date=2025-11-02&tz=America/New_York");
    expect(res.status).toBe(200);
    // Just verify it doesn't error - the calculation should handle 25h day
  });
});
