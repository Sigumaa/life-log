import { Hono } from "hono";
import { and, eq, desc, gte, lte, sql } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { subDays, parseISO, format, isValid, addDays } from "date-fns";
import type { Env } from "../../app/env";
import type { Database } from "../db";
import { logs, logTypes, type LogType } from "../db/schema";

type Variables = {
  db: Database;
};

export const searchRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Date regex for YYYY-MM-DD format
const dateRegex = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

// Validate log type
function isValidLogType(type: string): type is LogType {
  return logTypes.includes(type as LogType);
}

// Escape special LIKE characters
function escapeLike(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// GET /api/search - Search logs by content
searchRoutes.get("/", async (c) => {
  const db = c.get("db");
  const q = c.req.query("q");
  const type = c.req.query("type");
  const date = c.req.query("date");
  const tz = c.req.query("tz");

  // Validate query (minimum 2 characters)
  if (!q || q.length < 2) {
    return c.json({ error: "q parameter must be at least 2 characters" }, 400);
  }

  // Validate tz (required)
  if (!tz) {
    return c.json({ error: "tz parameter is required" }, 400);
  }

  // Validate type if provided
  if (type && !isValidLogType(type)) {
    return c.json({ error: "Invalid type" }, 400);
  }

  // Calculate date range
  let startUtc: number, endUtc: number;

  if (date) {
    // Specific date provided
    if (!dateRegex.test(date)) {
      return c.json({ error: "Invalid date format" }, 400);
    }
    const parsedDate = parseISO(date);
    if (!isValid(parsedDate) || format(parsedDate, "yyyy-MM-dd") !== date) {
      return c.json({ error: "Invalid date" }, 400);
    }

    try {
      startUtc = fromZonedTime(`${date}T00:00:00`, tz).getTime();
      const nextDate = addDays(parsedDate, 1);
      endUtc = fromZonedTime(`${format(nextDate, "yyyy-MM-dd")}T00:00:00`, tz).getTime() - 1;
      if (isNaN(startUtc) || isNaN(endUtc)) throw new Error();
    } catch {
      return c.json({ error: "Invalid timezone" }, 400);
    }
  } else {
    // Default to last 90 days
    try {
      const now = new Date();
      const today = format(now, "yyyy-MM-dd");
      const start90 = format(subDays(now, 90), "yyyy-MM-dd");

      endUtc = fromZonedTime(`${today}T23:59:59`, tz).getTime();
      startUtc = fromZonedTime(`${start90}T00:00:00`, tz).getTime();
      if (isNaN(startUtc) || isNaN(endUtc)) throw new Error();
    } catch {
      return c.json({ error: "Invalid timezone" }, 400);
    }
  }

  // Build conditions
  // Use raw SQL for LIKE with ESCAPE clause to properly handle special characters
  const escapedQuery = escapeLike(q);
  const likePattern = `%${escapedQuery}%`;
  const conditions = [
    sql`${logs.content} LIKE ${likePattern} ESCAPE '\\'`,
    gte(logs.timestamp, startUtc),
    lte(logs.timestamp, endUtc),
  ];

  if (type) {
    conditions.push(eq(logs.type, type as LogType));
  }

  const result = await db
    .select()
    .from(logs)
    .where(and(...conditions))
    .orderBy(desc(logs.timestamp), desc(logs.id))
    .limit(50);

  return c.json({ items: result });
});
