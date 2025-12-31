import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ログのタイプ
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

// logs テーブル
export const logs = sqliteTable(
  "logs",
  {
    id: text("id").primaryKey(), // ULID
    type: text("type").$type<LogType>().notNull(),
    content: text("content").notNull(),
    timestamp: integer("timestamp").notNull(), // epoch ms
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("idx_logs_timestamp").on(table.timestamp),
    index("idx_logs_type").on(table.type),
    index("idx_logs_created_at").on(table.createdAt),
  ]
);

// tags テーブル
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(), // ULID
  name: text("name").notNull().unique(),
  color: text("color"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// log_tags テーブル（多対多の関連）
export const logTags = sqliteTable(
  "log_tags",
  {
    logId: text("log_id")
      .notNull()
      .references(() => logs.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.logId, table.tagId] }),
    index("idx_log_tags_log_id").on(table.logId),
    index("idx_log_tags_tag_id").on(table.tagId),
  ]
);

// 型定義
export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type LogTag = typeof logTags.$inferSelect;
