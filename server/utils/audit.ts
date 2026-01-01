import type { Context } from "hono";
import type { Env } from "../../app/env";

const MAX_CONTENT_LENGTH = 1800;
const MAX_PATH_LENGTH = 500;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function buildAuditContent(c: Context<{ Bindings: Env }>, durationMs: number): string {
  const url = new URL(c.req.url);
  const path = truncate(`${url.pathname}${url.search}`, MAX_PATH_LENGTH);
  const method = c.req.method;
  const status = c.res.status;
  const ip =
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
  const country = c.req.header("CF-IPCountry");
  const origin = c.req.header("Origin");
  const referer = c.req.header("Referer");
  const userAgent = c.req.header("User-Agent");
  const rayId = c.req.header("CF-Ray");

  const lines = [
    `[lifelog] ${method} ${path} ${status} ${durationMs}ms`,
    ip ? `ip: ${ip}` : null,
    country ? `country: ${country}` : null,
    origin ? `origin: ${origin}` : null,
    referer ? `referer: ${referer}` : null,
    userAgent ? `ua: ${userAgent}` : null,
    rayId ? `ray: ${rayId}` : null,
  ].filter(Boolean);

  return truncate(lines.join("\n"), MAX_CONTENT_LENGTH);
}

export function queueAuditLog(
  c: Context<{ Bindings: Env }>,
  durationMs: number,
): void {
  const webhookUrl = c.env.AUDIT_WEBHOOK_URL;
  if (!webhookUrl) return;

  const payload = {
    content: buildAuditContent(c, durationMs),
    allowed_mentions: { parse: [] as string[] },
  };

  const send = fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.error("Audit webhook failed:", err);
  });

  if (c.executionCtx?.waitUntil) {
    c.executionCtx.waitUntil(send);
  } else {
    void send;
  }
}
