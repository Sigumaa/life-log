import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { Miniflare } from "miniflare";
import { readFileSync } from "fs";
import { join } from "path";
import { tagsRoutes } from "../../server/routes/tags";
import { createDb } from "../../server/db";
import { sql } from "drizzle-orm";

const migrationPath = join(__dirname, "../../server/db/migrations/0000_solid_the_watchers.sql");
const migrationSql = readFileSync(migrationPath, "utf-8");

describe("Tags API", () => {
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

  describe("GET /tags", () => {
    it("returns empty array when no tags", async () => {
      const res = await app.request("/tags");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it("returns all tags", async () => {
      // Create some tags
      await app.request("/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "tag1" }),
      });
      await app.request("/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "tag2" }),
      });

      const res = await app.request("/tags");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBe(2);
    });
  });

  describe("POST /tags", () => {
    it("creates a tag successfully", async () => {
      const res = await app.request("/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test-tag", color: "#ff0000" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(body.name).toBe("test-tag");
      expect(body.color).toBe("#ff0000");
    });

    it("returns 400 for missing name", async () => {
      const res = await app.request("/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: "#ff0000" }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for empty name", async () => {
      const res = await app.request("/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 409 for duplicate name", async () => {
      await app.request("/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "duplicate" }),
      });

      const res = await app.request("/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "duplicate" }),
      });

      expect(res.status).toBe(409);
    });
  });

  describe("DELETE /tags/:id", () => {
    it("deletes a tag successfully", async () => {
      const createRes = await app.request("/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "to-delete" }),
      });
      const tag = await createRes.json();

      const deleteRes = await app.request(`/tags/${tag.id}`, {
        method: "DELETE",
      });

      expect(deleteRes.status).toBe(200);

      const listRes = await app.request("/tags");
      const tags = await listRes.json();
      expect(tags.find((t: { id: string }) => t.id === tag.id)).toBeUndefined();
    });

    it("returns 400 for invalid ULID", async () => {
      const res = await app.request("/tags/invalid-id", {
        method: "DELETE",
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent tag", async () => {
      const res = await app.request("/tags/01JGHX7E7K0000000000000000", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });
});
