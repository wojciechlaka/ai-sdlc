CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`stage` text NOT NULL,
	`seq` integer NOT NULL,
	`trigger` text NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`status` text NOT NULL,
	`model` text NOT NULL,
	`cost_usd` real,
	`input_tokens` integer,
	`cache_creation_tokens` integer,
	`cache_read_tokens` integer,
	`output_tokens` integer,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`ticket_key`) REFERENCES `tickets`(`key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`stage` text NOT NULL,
	`path` text NOT NULL,
	`branch` text NOT NULL,
	`pr_number` integer NOT NULL,
	`pr_url` text NOT NULL,
	`pr_state` text DEFAULT 'open' NOT NULL,
	`merged_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_key`) REFERENCES `tickets`(`key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`actor` text NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_key`) REFERENCES `tickets`(`key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`key` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`priority` text,
	`source_path` text NOT NULL,
	`stage` text DEFAULT 'plan' NOT NULL,
	`state` text DEFAULT 'ready' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
