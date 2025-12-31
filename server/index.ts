import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { Env } from "../app/env";
import { createDb } from "./db";
import { logsRoutes } from "./routes/logs";
import { tagsRoutes } from "./routes/tags";
import { searchRoutes } from "./routes/search";
import { statsRoutes } from "./routes/stats";
import { previewRoutes } from "./routes/preview";
import { timelineRoutes } from "./routes/timeline";

const app = new Hono<{ Bindings: Env }>().basePath("/api");

// CSRF Protection Middleware for write operations
app.use("*", async (c, next) => {
  const method = c.req.method;

  // Skip CSRF check for GET and HEAD requests
  if (method === "GET" || method === "HEAD") {
    return next();
  }

  // Check X-Requested-With header
  const requestedWith = c.req.header("X-Requested-With");
  if (requestedWith !== "lifelog") {
    return c.json({ error: "Forbidden: Missing X-Requested-With header" }, 403);
  }

  // Origin validation
  const origin = c.req.header("Origin");
  const allowedHost = c.env.ALLOWED_ORIGIN || c.req.header("Host");
  let allowed = false;
  try {
    if (origin) {
      const url = new URL(origin);
      allowed =
        (url.protocol === "https:" && url.host === allowedHost) ||
        (url.protocol === "http:" && url.hostname === "localhost");
    } else if (allowedHost) {
      // Some same-origin requests may omit Origin; allow if Host matches.
      const host = c.req.header("Host");
      allowed = host === allowedHost;
    }
  } catch {
    // origin is invalid format
  }

  if (!allowed) {
    return c.json({ error: "Forbidden: Invalid origin" }, 403);
  }

  return next();
});

// Enable foreign keys and set up db for each request
app.use("*", async (c, next) => {
  const db = createDb(c.env.DB);
  // Enable foreign keys (must be done per request as D1 connection may change)
  await db.run(sql`PRAGMA foreign_keys = ON`);
  c.set("db" as never, db);
  return next();
});

// Standardized API error response
app.onError((err, c) => {
  console.error("API error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Mount routes
app.route("/logs", logsRoutes);
app.route("/tags", tagsRoutes);
app.route("/search", searchRoutes);
app.route("/stats", statsRoutes);
app.route("/preview", previewRoutes);
app.route("/timeline", timelineRoutes);

export { app };
export type AppType = typeof app;
