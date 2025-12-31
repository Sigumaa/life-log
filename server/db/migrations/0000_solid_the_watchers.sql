CREATE TABLE `log_tags` (
	`log_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`log_id`, `tag_id`),
	FOREIGN KEY (`log_id`) REFERENCES `logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_log_tags_log_id` ON `log_tags` (`log_id`);--> statement-breakpoint
CREATE INDEX `idx_log_tags_tag_id` ON `log_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `logs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`timestamp` integer NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_logs_timestamp` ON `logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_logs_type` ON `logs` (`type`);--> statement-breakpoint
CREATE INDEX `idx_logs_created_at` ON `logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);