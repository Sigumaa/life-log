// API client for LifeLog

export const logTypes = [
  "activity",
  "wake_up",
  "meal",
  "location",
  "thought",
  "reading",
  "media",
  "bookmark",
] as const;

export type LogType = (typeof logTypes)[number];

export interface Log {
  id: string;
  type: LogType;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  tagIds?: string[];
}

export interface Tag {
  id: string;
  name: string;
  color?: string | null;
  createdAt: number;
}

export interface Stats {
  todayCount: number;
  weekCount: number;
  recentUrls: string[];
  topTags: { id: string; name: string; count: number }[];
  monthDays?: { date: string; count: number }[];
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  hostname?: string;
}

export interface LogsResponse {
  items: Log[];
  hasMore: boolean;
  cursor?: string;
}

export interface SearchResponse {
  items: Log[];
}

// Get user's timezone
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Get today's date in YYYY-MM-DD format for user's timezone
export function getTodayDate(): string {
  const now = new Date();
  return formatDateLocal(now);
}

// Format a date to YYYY-MM-DD in local timezone
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Parse YYYY-MM-DD to Date (at midnight local time)
export function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// API request helper with CSRF headers
async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Add CSRF headers for non-GET requests
  if (options.method && options.method !== "GET") {
    headers["X-Requested-With"] = "lifelog";
  }

  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
    throw new Error(errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

// Logs API
export async function getLogs(
  date: string,
  options?: { limit?: number; cursor?: string }
): Promise<LogsResponse> {
  const tz = getUserTimezone();
  const params = new URLSearchParams({ date, tz });
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.cursor) params.set("cursor", options.cursor);

  return apiRequest<LogsResponse>(`/logs?${params}`);
}

export async function getLog(id: string): Promise<Log> {
  return apiRequest<Log>(`/logs/${id}`);
}

export async function createLog(
  data: Omit<Log, "id" | "createdAt" | "updatedAt">
): Promise<Log> {
  return apiRequest<Log>("/logs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateLog(
  id: string,
  data: Partial<Pick<Log, "content" | "metadata" | "tagIds">>
): Promise<Log> {
  return apiRequest<Log>(`/logs/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteLog(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/logs/${id}`, {
    method: "DELETE",
  });
}

// Tags API
export async function getTags(): Promise<Tag[]> {
  return apiRequest<Tag[]>("/tags");
}

export async function createTag(data: { name: string; color?: string }): Promise<Tag> {
  return apiRequest<Tag>("/tags", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteTag(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/tags/${id}`, {
    method: "DELETE",
  });
}

// Search API
export async function searchLogs(
  q: string,
  options?: { type?: LogType; date?: string }
): Promise<SearchResponse> {
  const tz = getUserTimezone();
  const params = new URLSearchParams({ q, tz });
  if (options?.type) params.set("type", options.type);
  if (options?.date) params.set("date", options.date);

  return apiRequest<SearchResponse>(`/search?${params}`);
}

// Stats API
export async function getStats(): Promise<Stats> {
  const tz = getUserTimezone();
  return apiRequest<Stats>(`/stats?tz=${tz}`);
}

export async function getMonthCounts(month: string): Promise<{ date: string; count: number }[]> {
  const tz = getUserTimezone();
  const params = new URLSearchParams({ tz, month });
  const res = await apiRequest<Stats>(`/stats?${params}`);
  return res.monthDays ?? [];
}

export async function getLinkPreview(url: string): Promise<LinkPreview> {
  const params = new URLSearchParams({ url });
  return apiRequest<LinkPreview>(`/preview?${params}`);
}
