import { Hono } from "hono";
import { and, eq, lt, desc, or, inArray } from "drizzle-orm";
import type { Env } from "../../app/env";
import type { Database } from "../db";
import { logs, logTypes, type LogType } from "../db/schema";

type Variables = {
  db: Database;
};

export const timelineRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

function parseTypes(typeParam?: string, typesParam?: string): LogType[] {
  const candidates = typesParam
    ? typesParam.split(",").map((v) => v.trim()).filter(Boolean)
    : typeParam
      ? [typeParam]
      : [];

  if (candidates.length === 0) return [];

  const valid: LogType[] = [];
  for (const value of candidates) {
    if (!logTypes.includes(value as LogType)) {
      throw new Error("Invalid type");
    }
    valid.push(value as LogType);
  }
  return valid;
}

timelineRoutes.get("/", async (c) => {
  const db = c.get("db");
  const typeParam = c.req.query("type");
  const typesParam = c.req.query("types");
  const limitParam = c.req.query("limit");
  const cursor = c.req.query("cursor");

  let types: LogType[] = [];
  try {
    types = parseTypes(typeParam ?? undefined, typesParam ?? undefined);
  } catch {
    return c.json({ error: "Invalid type" }, 400);
  }

  const limitValue = Number(limitParam);
  const limitNum = Number.isFinite(limitValue)
    ? Math.max(1, Math.min(100, limitValue))
    : 50;

  let cursorTs: number | undefined;
  let cursorId: string | undefined;
  if (cursor) {
    const parts = cursor.split("_");
    const ts = Number(parts[0]);
    const id = parts.slice(1).join("_");
    const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/;
    if (isNaN(ts) || ts <= 0 || !ulidRegex.test(id)) {
      return c.json({ error: "Invalid cursor" }, 400);
    }
    cursorTs = ts;
    cursorId = id;
  }

  const conditions = [];
  if (types.length > 0) {
    conditions.push(inArray(logs.type, types));
  }
  if (cursorTs !== undefined && cursorId !== undefined) {
    conditions.push(
      or(
        lt(logs.timestamp, cursorTs),
        and(eq(logs.timestamp, cursorTs), lt(logs.id, cursorId))
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const result = await db
    .select()
    .from(logs)
    .where(whereClause)
    .orderBy(desc(logs.timestamp), desc(logs.id))
    .limit(limitNum + 1);

  const hasMore = result.length > limitNum;
  const items = hasMore ? result.slice(0, limitNum) : result;
  const nextCursor =
    hasMore && items.length > 0
      ? `${items[items.length - 1].timestamp}_${items[items.length - 1].id}`
      : null;

  return c.json({
    items,
    nextCursor,
    hasMore,
  });
});
