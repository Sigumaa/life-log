import type { Context } from "hono";
import type { Env } from "../../app/env";

const MAX_PATH_LENGTH = 500;
const MAX_FIELD_LENGTH = 900;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function toField(name: string, value?: string, inline = true) {
  if (!value) return null;
  return {
    name,
    value: truncate(value, MAX_FIELD_LENGTH),
    inline,
  };
}

function buildAuditPayload(
  c: Context<{ Bindings: Env }>,
  durationMs: number,
): {
  accessAuthed: boolean;
  content?: string;
  embeds: Array<Record<string, unknown>>;
  allowed_mentions: { parse: string[]; users?: string[] };
} {
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
  const accessAuthed = Boolean(
    c.req.header("Cf-Access-Authenticated-User-Email") ||
      c.req.header("Cf-Access-Authenticated-User-Id") ||
      c.req.header("Cf-Access-Jwt-Assertion"),
  );

  const mentionId = c.env.AUDIT_MENTION_USER_ID?.match(/\d+/)?.[0];
  const shouldMention = !accessAuthed && Boolean(mentionId);

  const color = !accessAuthed
    ? 0xef4444
    : status >= 500
      ? 0xdc2626
      : status >= 400
        ? 0xf59e0b
        : 0x10b981;

  const fields = [
    toField("Method", method),
    toField("Path", path, false),
    toField("Status", String(status)),
    toField("Duration", `${durationMs}ms`),
    toField("Access", accessAuthed ? "ok" : "none"),
    toField("IP", ip),
    toField("Country", country),
    toField("Origin", origin, false),
    toField("Referer", referer, false),
    toField("User-Agent", userAgent, false),
    toField("Ray", rayId),
  ].filter(Boolean);

  return {
    accessAuthed,
    content: shouldMention && mentionId ? `<@${mentionId}>` : undefined,
    embeds: [
      {
        title: "LifeLog API",
        color,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
    allowed_mentions: shouldMention && mentionId
      ? { parse: [], users: [mentionId] }
      : { parse: [] },
  };
}

export function queueAuditLog(
  c: Context<{ Bindings: Env }>,
  durationMs: number,
): void {
  const webhookUrl = c.env.AUDIT_WEBHOOK_URL;
  if (!webhookUrl) return;

  const payload = buildAuditPayload(c, durationMs);

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
