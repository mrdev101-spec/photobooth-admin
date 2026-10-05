ALTER TABLE `catalog_templates` ADD `org_id` varchar(32);--> statement-breakpoint
ALTER TABLE `organizations` ADD `template_quota` int DEFAULT 0;