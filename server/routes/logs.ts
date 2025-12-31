import { Hono } from "hono";
import { eq, and, or, lt, desc, gte, lte } from "drizzle-orm";
import { ulid } from "../utils/ulid";
import { fromZonedTime } from "date-fns-tz";
import { addDays, parseISO, format, isValid } from "date-fns";
import type { Env } from "../../app/env";
import type { Database } from "../db";
import { logs, logTags, logTypes, type LogType, type NewLog } from "../db/schema";

type Variables = {
  db: Database;
};

export const logsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Date regex for YYYY-MM-DD format
const dateRegex = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

// ULID regex (26 characters, Crockford's base32)
const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// Validate log type
function isValidLogType(type: string): type is LogType {
  return logTypes.includes(type as LogType);
}

// GET /api/logs - List logs with date filter
logsRoutes.get("/", async (c) => {
  const db = c.get("db");
  const date = c.req.query("date");
  const tz = c.req.query("tz");
  const limitParam = c.req.query("limit");
  const cursor = c.req.query("cursor");

  // Validate date (required)
  if (!date) {
    return c.json({ error: "date parameter is required" }, 400);
  }
  if (!dateRegex.test(date)) {
    return c.json({ error: "Invalid date format" }, 400);
  }
  const parsedDate = parseISO(date);
  if (!isValid(parsedDate) || format(parsedDate, "yyyy-MM-dd") !== date) {
    return c.json({ error: "Invalid date" }, 400);
  }

  // Validate tz (required)
  if (!tz) {
    return c.json({ error: "tz parameter is required" }, 400);
  }

  // Limit clamp (1-100, default 50)
  const limitValue = Number(limitParam);
  const limitNum = Number.isFinite(limitValue)
    ? Math.max(1, Math.min(100, limitValue))
    : 50;

  // Cursor validation
  let cursorTs: number | undefined;
  let cursorId: string | undefined;
  if (cursor) {
    const parts = cursor.split("_");
    const ts = Number(parts[0]);
    const id = parts.slice(1).join("_");
    if (isNaN(ts) || ts <= 0 || !ulidRegex.test(id)) {
      return c.json({ error: "Invalid cursor" }, 400);
    }
    cursorTs = ts;
    cursorId = id;
  }

  // TZ validation and range calculation
  let startUtc: number, endUtc: number;
  try {
    startUtc = fromZonedTime(`${date}T00:00:00`, tz).getTime();
    const nextDate = addDays(parsedDate, 1);
    endUtc = fromZonedTime(`${format(nextDate, "yyyy-MM-dd")}T00:00:00`, tz).getTime() - 1;
    if (isNaN(startUtc) || isNaN(endUtc)) throw new Error();
  } catch {
    return c.json({ error: "Invalid timezone" }, 400);
  }

  // Build query conditions
  const conditions = [
    gte(logs.timestamp, startUtc),
    lte(logs.timestamp, endUtc),
  ];

  // Add cursor condition if provided
  if (cursorTs !== undefined && cursorId !== undefined) {
    conditions.push(
      or(
        lt(logs.timestamp, cursorTs),
        and(eq(logs.timestamp, cursorTs), lt(logs.id, cursorId))
      )!
    );
  }

  const result = await db
    .select()
    .from(logs)
    .where(and(...conditions))
    .orderBy(desc(logs.timestamp), desc(logs.id))
    .limit(limitNum + 1); // Fetch one extra to determine if there's more

  const hasMore = result.length > limitNum;
  const items = hasMore ? result.slice(0, limitNum) : result;
  const nextCursor = hasMore && items.length > 0
    ? `${items[items.length - 1].timestamp}_${items[items.length - 1].id}`
    : null;

  return c.json({
    items,
    nextCursor,
    hasMore,
  });
});

// GET /api/logs/:id - Get single log
logsRoutes.get("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  if (!ulidRegex.test(id)) {
    return c.json({ error: "Invalid log id" }, 400);
  }

  const result = await db.select().from(logs).where(eq(logs.id, id)).limit(1);

  if (result.length === 0) {
    return c.json({ error: "Log not found" }, 404);
  }

  // Get associated tags
  const tagIds = await db
    .select({ tagId: logTags.tagId })
    .from(logTags)
    .where(eq(logTags.logId, id));

  return c.json({
    ...result[0],
    tagIds: tagIds.map((t) => t.tagId),
  });
});

// POST /api/logs - Create log
logsRoutes.post("/", async (c) => {
  const db = c.get("db");

  let body: {
    type: string;
    content: string;
    timestamp?: number;
    metadata?: Record<string, unknown>;
    tagIds?: string[];
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Validate type
  if (!body.type || !isValidLogType(body.type)) {
    return c.json({ error: "Invalid or missing type" }, 400);
  }

  // Validate content
  if (!body.content || typeof body.content !== "string" || body.content.trim() === "") {
    return c.json({ error: "content is required" }, 400);
  }

  // Generate ULID and set timestamp
  const id = ulid();
  const timestamp = body.timestamp ?? Date.now();
  const now = Date.now();

  const newLog: NewLog = {
    id,
    type: body.type,
    content: body.content.trim(),
    timestamp,
    metadata: body.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(logs).values(newLog);

  // Insert tag associations if provided
  if (body.tagIds && Array.isArray(body.tagIds) && body.tagIds.length > 0) {
    const validTagIds = body.tagIds.filter((tagId) => ulidRegex.test(tagId));
    if (validTagIds.length > 0) {
      await db.insert(logTags).values(
        validTagIds.map((tagId) => ({
          logId: id,
          tagId,
        }))
      );
    }
  }

  return c.json(newLog, 201);
});

// PUT /api/logs/:id - Update log
logsRoutes.put("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  if (!ulidRegex.test(id)) {
    return c.json({ error: "Invalid log id" }, 400);
  }

  // Check if log exists
  const existing = await db.select().from(logs).where(eq(logs.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: "Log not found" }, 404);
  }

  let body: {
    type?: string;
    content?: string;
    timestamp?: number;
    metadata?: Record<string, unknown>;
    tagIds?: string[];
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Validate type if provided
  if (body.type !== undefined && !isValidLogType(body.type)) {
    return c.json({ error: "Invalid type" }, 400);
  }

  // Build update object
  const updates: Partial<NewLog> = {
    updatedAt: Date.now(),
  };

  if (body.type !== undefined) updates.type = body.type;
  if (body.content !== undefined) updates.content = body.content.trim();
  if (body.timestamp !== undefined) updates.timestamp = body.timestamp;
  if (body.metadata !== undefined) updates.metadata = body.metadata;

  await db.update(logs).set(updates).where(eq(logs.id, id));

  // Update tag associations if provided
  if (body.tagIds !== undefined) {
    // Remove existing associations
    await db.delete(logTags).where(eq(logTags.logId, id));

    // Insert new associations
    if (Array.isArray(body.tagIds) && body.tagIds.length > 0) {
      const validTagIds = body.tagIds.filter((tagId) => ulidRegex.test(tagId));
      if (validTagIds.length > 0) {
        await db.insert(logTags).values(
          validTagIds.map((tagId) => ({
            logId: id,
            tagId,
          }))
        );
      }
    }
  }

  // Fetch updated log
  const updated = await db.select().from(logs).where(eq(logs.id, id)).limit(1);

  return c.json(updated[0]);
});

// DELETE /api/logs/:id - Delete log
logsRoutes.delete("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  if (!ulidRegex.test(id)) {
    return c.json({ error: "Invalid log id" }, 400);
  }

  // Check if log exists
  const existing = await db.select().from(logs).where(eq(logs.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: "Log not found" }, 404);
  }

  // Delete log (tag associations will be deleted by CASCADE)
  await db.delete(logs).where(eq(logs.id, id));

  return c.json({ success: true });
});
