import { Hono } from "hono";
import type { Env } from "../../app/env";

export const previewRoutes = new Hono<{ Bindings: Env }>();

const maxUrlLength = 2048;
const maxHtmlLength = 400_000;

previewRoutes.get("/", async (c) => {
  const rawUrl = c.req.query("url");
  if (!rawUrl) {
    return c.json({ error: "url parameter is required" }, 400);
  }
  if (rawUrl.length > maxUrlLength) {
    return c.json({ error: "url is too long" }, 400);
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return c.json({ error: "Invalid url" }, 400);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return c.json({ error: "Invalid url protocol" }, 400);
  }

  if (isBlockedHost(url.hostname)) {
    return c.json({ error: "Blocked host" }, 400);
  }

  const fetchUrl = rewritePreviewUrl(url);

  let response: Response;
  try {
    response = await fetch(fetchUrl.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "LifeLogPreview/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    return c.json({ error: "Failed to fetch preview" }, 502);
  }

  if (!response.ok) {
    return c.json({ error: `Upstream error: ${response.status}` }, 502);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    c.header("Cache-Control", "public, max-age=3600");
    return c.json({
      url: url.toString(),
      hostname: url.hostname,
      title: url.hostname,
    });
  }

  let html = await response.text();
  if (html.length > maxHtmlLength) {
    html = html.slice(0, maxHtmlLength);
  }

  const meta = extractMetadata(html);
  if (meta.image) {
    try {
      meta.image = new URL(meta.image, fetchUrl.toString()).toString();
    } catch {
      // keep original
    }
  }
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({
    url: url.toString(),
    hostname: url.hostname,
    ...meta,
  });
});

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  if (lower.endsWith(".local")) return true;
  if (lower.includes(":")) {
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
      return true;
    }
  }
  const parts = lower.split(".");
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => n < 0 || n > 255)) return true;
    const [a, b] = nums;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function extractMetadata(html: string) {
  const metaTags = html.match(/<meta[^>]+>/gi) ?? [];
  let title: string | undefined;
  let description: string | undefined;
  let image: string | undefined;
  let siteName: string | undefined;

  for (const tag of metaTags) {
    const attrs: Record<string, string> = {};
    tag.replace(/([a-zA-Z0-9:_-]+)\s*=\s*["']([^"']+)["']/g, (_, key, value) => {
      attrs[key.toLowerCase()] = value;
      return "";
    });
    const prop = (attrs.property || attrs.name || "").toLowerCase();
    const content = attrs.content;
    if (!content) continue;
    switch (prop) {
      case "og:title":
        title = title ?? content;
        break;
      case "og:description":
        description = description ?? content;
        break;
      case "description":
        description = description ?? content;
        break;
      case "og:image":
        image = image ?? content;
        break;
      case "og:site_name":
        siteName = siteName ?? content;
        break;
      default:
        break;
    }
  }

  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) title = decodeEntities(titleMatch[1].trim());
  }

  return {
    title: title?.slice(0, 200),
    description: description?.slice(0, 280),
    image,
    siteName,
  };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function rewritePreviewUrl(url: URL): URL {
  const host = url.hostname.toLowerCase();
  if (
    host === "x.com" ||
    host === "www.x.com" ||
    host === "twitter.com" ||
    host === "www.twitter.com" ||
    host === "mobile.twitter.com"
  ) {
    const rewritten = new URL(url.toString());
    rewritten.hostname = "fxtwitter.com";
    return rewritten;
  }
  return url;
}
