CREATE TABLE `config_events` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`name` varchar(120) NOT NULL,
	`note` varchar(500) NOT NULL DEFAULT '',
	`settings` json NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(32),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `config_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `org_config_defaults` (
	`org_id` varchar(32) NOT NULL,
	`settings` json NOT NULL,
	`updated_by` varchar(32),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `org_config_defaults_org_id` PRIMARY KEY(`org_id`)
);
--> statement-breakpoint
ALTER TABLE `kiosks` ADD `event_id` varchar(32);--> statement-breakpoint
ALTER TABLE `kiosks` ADD `own_sections` json;--> statement-breakpoint
CREATE INDEX `config_events_org_idx` ON `config_events` (`org_id`,`is_active`);