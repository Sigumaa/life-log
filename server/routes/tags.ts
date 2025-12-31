import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { ulid } from "../utils/ulid";
import type { Env } from "../../app/env";
import type { Database } from "../db";
import { tags, type NewTag } from "../db/schema";

type Variables = {
  db: Database;
};

export const tagsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ULID regex (26 characters, Crockford's base32)
const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// GET /api/tags - List all tags
tagsRoutes.get("/", async (c) => {
  const db = c.get("db");
  const result = await db.select().from(tags);
  return c.json(result);
});

// POST /api/tags - Create tag
tagsRoutes.post("/", async (c) => {
  const db = c.get("db");

  let body: {
    name: string;
    color?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Validate name
  if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
    return c.json({ error: "name is required" }, 400);
  }

  const name = body.name.trim();

  // Check for duplicate name
  const existing = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: "Tag with this name already exists" }, 409);
  }

  const id = ulid();
  const now = Date.now();

  const newTag: NewTag = {
    id,
    name,
    color: body.color ?? null,
    createdAt: now,
  };

  await db.insert(tags).values(newTag);

  return c.json(newTag, 201);
});

// DELETE /api/tags/:id - Delete tag
tagsRoutes.delete("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  if (!ulidRegex.test(id)) {
    return c.json({ error: "Invalid tag id" }, 400);
  }

  // Check if tag exists
  const existing = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: "Tag not found" }, 404);
  }

  // Delete tag (log_tags associations will be deleted by CASCADE)
  await db.delete(tags).where(eq(tags.id, id));

  return c.json({ success: true });
});
