ALTER TABLE `kiosks` ADD `archived_at` datetime(3);--> statement-breakpoint
ALTER TABLE `kiosks` ADD `archived_reason` varchar(255);--> statement-breakpoint
ALTER TABLE `kiosks` ADD `archived_by` varchar(32);