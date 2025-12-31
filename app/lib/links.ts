export type LinkPart =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

const urlRegex = /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+)/gi;
const trailingPunctuation = /[)\].,!?:;]+$/;

function splitTrailing(raw: string): { trimmed: string; trailing: string } {
  let trimmed = raw;
  let trailing = "";
  while (trailingPunctuation.test(trimmed)) {
    trailing = trimmed.slice(-1) + trailing;
    trimmed = trimmed.slice(0, -1);
  }
  return { trimmed, trailing };
}

function normalizeUrl(raw: string): { href: string; label: string; trailing: string } {
  const { trimmed, trailing } = splitTrailing(raw);
  const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  return { href, label: trimmed, trailing };
}

export function linkifyText(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let lastIndex = 0;
  const matches = text.matchAll(urlRegex);

  for (const match of matches) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, index) });
    }

    const { href, label, trailing } = normalizeUrl(raw);
    parts.push({ type: "link", value: label, href });
    if (trailing) {
      parts.push({ type: "text", value: trailing });
    }
    lastIndex = index + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts;
}

export function extractUrls(text: string): string[] {
  return linkifyText(text)
    .filter((part): part is { type: "link"; value: string; href: string } => part.type === "link")
    .map((part) => part.href);
}

export function hasUrl(text: string): boolean {
  return extractUrls(text).length > 0;
}
