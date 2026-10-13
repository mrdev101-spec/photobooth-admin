ALTER TABLE `payments` MODIFY COLUMN `status` enum('requires_action','processing','succeeded','canceled','failed','refunded') NOT NULL DEFAULT 'requires_action';--> statement-breakpoint
ALTER TABLE `payments` ADD `refunded_at` datetime(3);--> statement-breakpoint
ALTER TABLE `payments` ADD `refund_id` varchar(64);--> statement-breakpoint
ALTER TABLE `payments` ADD `refunded_by` varchar(40);--> statement-breakpoint
ALTER TABLE `payments` ADD `refund_reason` varchar(200);