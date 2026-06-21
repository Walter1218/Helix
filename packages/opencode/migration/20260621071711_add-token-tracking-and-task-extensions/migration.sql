CREATE TABLE `actor_registry` (
	`session_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`mode` text NOT NULL,
	`parent_actor_id` text,
	`status` text NOT NULL,
	`last_outcome` text,
	`lifecycle` text NOT NULL,
	`agent` text NOT NULL,
	`description` text NOT NULL,
	`context_mode` text NOT NULL,
	`context_watermark` text,
	`background` integer NOT NULL,
	`tools` text,
	`last_turn_time` integer NOT NULL,
	`turn_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`time_completed` integer,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `actor_registry_pk` PRIMARY KEY(`session_id`, `actor_id`),
	CONSTRAINT `fk_actor_registry_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `history_fts` (
	`part_id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`message_id` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`tool_name` text,
	`body` text NOT NULL,
	`time_created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inbox` (
	`id` text PRIMARY KEY,
	`receiver_session_id` text NOT NULL,
	`receiver_actor_id` text NOT NULL,
	`sender_session_id` text,
	`sender_actor_id` text,
	`type` text DEFAULT 'text' NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_inbox_receiver_session_id_session_id_fk` FOREIGN KEY (`receiver_session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `memory_fts` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`path` text NOT NULL UNIQUE,
	`scope` text NOT NULL,
	`scope_id` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`body` text NOT NULL,
	`fingerprint` text NOT NULL,
	`last_indexed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memory_vec` (
	`memory_path` text NOT NULL UNIQUE,
	`embedding` blob NOT NULL,
	`embedded_at` text NOT NULL,
	CONSTRAINT `fk_memory_vec_memory_path_memory_fts_path_fk` FOREIGN KEY (`memory_path`) REFERENCES `memory_fts`(`path`)
);
--> statement-breakpoint
CREATE TABLE `claude_import` (
	`source_uuid` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`source_path` text NOT NULL,
	`source_mtime` integer NOT NULL,
	`time_imported` integer NOT NULL,
	`message_ids` text
);
--> statement-breakpoint
CREATE TABLE `task_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`session_id` text NOT NULL,
	`task_id` text NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`summary` text,
	CONSTRAINT `fk_task_event_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_task_event_session_id_task_id_task_session_id_id_fk` FOREIGN KEY (`session_id`,`task_id`) REFERENCES `task`(`session_id`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `task` (
	`id` text NOT NULL,
	`session_id` text NOT NULL,
	`parent_task_id` text,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`owner` text,
	`created_at` integer NOT NULL,
	`last_event_at` integer NOT NULL,
	`ended_at` integer,
	`cleanup_after` integer,
	`priority` text DEFAULT 'medium' NOT NULL,
	`complexity` text DEFAULT 'moderate' NOT NULL,
	`estimated_tokens` integer,
	`actual_tokens` integer,
	`goal_alignment` real,
	`tags` text,
	CONSTRAINT `task_pk` PRIMARY KEY(`session_id`, `id`),
	CONSTRAINT `fk_task_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `daily_budget` (
	`date` text PRIMARY KEY,
	`total_budget` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`planning_used` integer DEFAULT 0 NOT NULL,
	`execution_used` integer DEFAULT 0 NOT NULL,
	`review_used` integer DEFAULT 0 NOT NULL,
	`testing_used` integer DEFAULT 0 NOT NULL,
	`compaction_used` integer DEFAULT 0 NOT NULL,
	`allocated` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `token_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`session_id` text NOT NULL,
	`task_id` text,
	`agent_type` text DEFAULT 'build' NOT NULL,
	`model_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`total_tokens` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`purpose` text DEFAULT 'execution' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_run` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`running` integer DEFAULT 0 NOT NULL,
	`succeeded` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`current_phase` text,
	`parent_actor_id` text,
	`args` text,
	`script_sha` text,
	`agent_timeout_ms` integer,
	`error` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_workflow_run_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `message` ADD `agent_id` text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE `session` ADD `context_from` text;--> statement-breakpoint
ALTER TABLE `session` ADD `context_watermark` text;--> statement-breakpoint
ALTER TABLE `session` ADD `last_checkpoint_message_id` text;--> statement-breakpoint
DROP INDEX IF EXISTS `session_entry_session_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `session_entry_session_type_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `session_entry_time_created_idx`;--> statement-breakpoint
CREATE INDEX `actor_registry_session_agent_idx` ON `actor_registry` (`session_id`,`agent`);--> statement-breakpoint
CREATE INDEX `actor_registry_session_parent_idx` ON `actor_registry` (`session_id`,`parent_actor_id`);--> statement-breakpoint
CREATE INDEX `actor_registry_status_idx` ON `actor_registry` (`status`);--> statement-breakpoint
CREATE INDEX `actor_registry_status_last_turn_idx` ON `actor_registry` (`status`,`last_turn_time`);--> statement-breakpoint
CREATE INDEX `history_fts_session_idx` ON `history_fts` (`session_id`,`time_created`);--> statement-breakpoint
CREATE INDEX `history_fts_project_idx` ON `history_fts` (`project_id`,`time_created`);--> statement-breakpoint
CREATE INDEX `history_fts_message_idx` ON `history_fts` (`message_id`);--> statement-breakpoint
CREATE INDEX `inbox_receiver_idx` ON `inbox` (`receiver_session_id`,`receiver_actor_id`,`id`);--> statement-breakpoint
CREATE INDEX `inbox_created_idx` ON `inbox` (`created_at`);--> statement-breakpoint
CREATE INDEX `memory_fts_scope_idx` ON `memory_fts` (`scope`,`scope_id`);--> statement-breakpoint
CREATE INDEX `memory_fts_type_idx` ON `memory_fts` (`type`);--> statement-breakpoint
CREATE INDEX `message_session_agent_idx` ON `message` (`session_id`,`agent_id`,`id`);--> statement-breakpoint
CREATE INDEX `session_context_from_idx` ON `session` (`context_from`);--> statement-breakpoint
CREATE INDEX `task_event_task_idx` ON `task_event` (`session_id`,`task_id`,`at`);--> statement-breakpoint
CREATE INDEX `task_session_idx` ON `task` (`session_id`);--> statement-breakpoint
CREATE INDEX `task_parent_idx` ON `task` (`session_id`,`parent_task_id`);--> statement-breakpoint
CREATE INDEX `task_status_idx` ON `task` (`status`);--> statement-breakpoint
CREATE INDEX `task_priority_idx` ON `task` (`priority`);--> statement-breakpoint
CREATE INDEX `daily_budget_date_idx` ON `daily_budget` (`date`);--> statement-breakpoint
CREATE INDEX `token_usage_session_idx` ON `token_usage` (`session_id`);--> statement-breakpoint
CREATE INDEX `token_usage_task_idx` ON `token_usage` (`task_id`);--> statement-breakpoint
CREATE INDEX `token_usage_timestamp_idx` ON `token_usage` (`timestamp`);--> statement-breakpoint
CREATE INDEX `token_usage_purpose_idx` ON `token_usage` (`purpose`);--> statement-breakpoint
CREATE INDEX `workflow_run_session_idx` ON `workflow_run` (`session_id`);--> statement-breakpoint
CREATE INDEX `workflow_run_status_idx` ON `workflow_run` (`status`);--> statement-breakpoint
DROP TABLE `session_entry`;--> statement-breakpoint
ALTER TABLE `todo` DROP COLUMN `priority`;