CREATE TABLE `catalog_assets` (
	`sha256` char(64) NOT NULL,
	`storage_key` varchar(200) NOT NULL,
	`content_type` varchar(40) NOT NULL,
	`bytes` int NOT NULL,
	`width` int,
	`height` int,
	`created_by` varchar(32),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `catalog_assets_sha256` PRIMARY KEY(`sha256`)
);
--> statement-breakpoint
CREATE TABLE `catalog_state` (
	`id` int NOT NULL,
	`manifest_revision` int NOT NULL DEFAULT 0,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `catalog_state_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `template_versions` (
	`id` varchar(32) NOT NULL,
	`kind` enum('photo-4x6','badge','classic','ai-scene') NOT NULL,
	`template_id` varchar(64) NOT NULL,
	`version` int NOT NULL,
	`spec` json NOT NULL,
	`files` json NOT NULL,
	`note` varchar(200),
	`created_by` varchar(32),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`published_at` datetime(3),
	CONSTRAINT `template_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `template_versions_uq` UNIQUE(`kind`,`template_id`,`version`)
);
--> statement-breakpoint
ALTER TABLE `catalog_templates` MODIFY COLUMN `status` enum('draft','published','retired') NOT NULL DEFAULT 'published';--> statement-breakpoint
ALTER TABLE `catalog_templates` ADD `name` varchar(80);--> statement-breakpoint
ALTER TABLE `catalog_templates` ADD `description` varchar(300);--> statement-breakpoint
ALTER TABLE `catalog_templates` ADD `tags` json;--> statement-breakpoint
ALTER TABLE `catalog_templates` ADD `published_version` int;--> statement-breakpoint
ALTER TABLE `catalog_templates` ADD `created_by` varchar(32);--> statement-breakpoint
ALTER TABLE `catalog_templates` ADD `created_at` datetime(3);--> statement-breakpoint
INSERT INTO `catalog_state` (`id`, `manifest_revision`) VALUES (1, 0);
