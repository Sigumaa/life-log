import { Hono } from "hono";
import { and, eq, lt, desc, count, gte } from "drizzle-orm";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays, parseISO, format, startOfWeek, addMonths, isValid } from "date-fns";
import type { Env } from "../../app/env";
import type { Database } from "../db";
import { logs, logTags, tags } from "../db/schema";

type Variables = {
  db: Database;
};

export const statsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/stats - Get statistics for sidebar
statsRoutes.get("/", async (c) => {
  const db = c.get("db");
  const tz = c.req.query("tz");
  const month = c.req.query("month");

  // Validate tz (required)
  if (!tz) {
    return c.json({ error: "tz parameter is required" }, 400);
  }

  // Calculate date boundaries
  let todayStart: number, tomorrowStart: number, weekStart: number, nextWeekStart: number;
  try {
    const now = new Date();
    const todayStr = format(toZonedTime(now, tz), "yyyy-MM-dd");
    todayStart = fromZonedTime(`${todayStr}T00:00:00`, tz).getTime();
    tomorrowStart = fromZonedTime(
      `${format(addDays(parseISO(todayStr), 1), "yyyy-MM-dd")}T00:00:00`,
      tz
    ).getTime();

    // Week start (Monday)
    const mondayStr = format(
      startOfWeek(parseISO(todayStr), { weekStartsOn: 1 }),
      "yyyy-MM-dd"
    );
    weekStart = fromZonedTime(`${mondayStr}T00:00:00`, tz).getTime();
    nextWeekStart = fromZonedTime(
      `${format(addDays(parseISO(mondayStr), 7), "yyyy-MM-dd")}T00:00:00`,
      tz
    ).getTime();

    if ([todayStart, tomorrowStart, weekStart, nextWeekStart].some(isNaN)) {
      throw new Error();
    }
  } catch {
    return c.json({ error: "Invalid timezone" }, 400);
  }

  // Count logs for today
  const todayCountResult = await db
    .select({ count: count() })
    .from(logs)
    .where(
      and(
        gte(logs.timestamp, todayStart),
        lt(logs.timestamp, tomorrowStart)
      )
    );
  const todayCount = todayCountResult[0]?.count ?? 0;

  // Count logs for this week
  const weekCountResult = await db
    .select({ count: count() })
    .from(logs)
    .where(
      and(
        gte(logs.timestamp, weekStart),
        lt(logs.timestamp, nextWeekStart)
      )
    );
  const weekCount = weekCountResult[0]?.count ?? 0;

  // Get recent URLs from metadata (last 10 bookmarks)
  const recentUrlsResult = await db
    .select({ metadata: logs.metadata })
    .from(logs)
    .where(eq(logs.type, "bookmark"))
    .orderBy(desc(logs.timestamp))
    .limit(10);

  const recentUrls = recentUrlsResult
    .map((r) => {
      if (r.metadata && typeof r.metadata === "object" && "url" in r.metadata) {
        return r.metadata.url as string;
      }
      return null;
    })
    .filter((url): url is string => url !== null);

  // Get top tags (most used)
  const topTagsResult = await db
    .select({
      id: tags.id,
      name: tags.name,
      count: count(logTags.logId),
    })
    .from(tags)
    .leftJoin(logTags, eq(tags.id, logTags.tagId))
    .groupBy(tags.id, tags.name)
    .orderBy(desc(count(logTags.logId)))
    .limit(10);

  let monthDays: Awaited<ReturnType<typeof getMonthCounts>> | undefined;
  if (month) {
    try {
      monthDays = await getMonthCounts(db, tz, month);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid month";
      return c.json({ error: message }, 400);
    }
  }

  return c.json({
    todayCount,
    weekCount,
    recentUrls,
    topTags: topTagsResult,
    ...(monthDays ? { monthDays } : {}),
  });
});

async function getMonthCounts(db: Database, tz: string, month: string) {
  const monthRegex = /^\d{4}-(?:0[1-9]|1[0-2])$/;
  if (!monthRegex.test(month)) {
    throw new Error("Invalid month");
  }

  const monthStartDate = parseISO(`${month}-01`);
  if (!isValid(monthStartDate) || format(monthStartDate, "yyyy-MM") !== month) {
    throw new Error("Invalid month");
  }

  let monthStartUtc: number;
  let nextMonthStartUtc: number;
  try {
    const nextMonth = addMonths(monthStartDate, 1);
    monthStartUtc = fromZonedTime(
      `${format(monthStartDate, "yyyy-MM-dd")}T00:00:00`,
      tz
    ).getTime();
    nextMonthStartUtc = fromZonedTime(
      `${format(nextMonth, "yyyy-MM-dd")}T00:00:00`,
      tz
    ).getTime();
    if (isNaN(monthStartUtc) || isNaN(nextMonthStartUtc)) throw new Error();
  } catch {
    throw new Error("Invalid timezone");
  }

  const rows = await db
    .select({ timestamp: logs.timestamp })
    .from(logs)
    .where(and(gte(logs.timestamp, monthStartUtc), lt(logs.timestamp, nextMonthStartUtc)));

  const counts = new Map<string, number>();
  for (const row of rows) {
    const dateStr = format(toZonedTime(new Date(row.timestamp), tz), "yyyy-MM-dd");
    counts.set(dateStr, (counts.get(dateStr) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
