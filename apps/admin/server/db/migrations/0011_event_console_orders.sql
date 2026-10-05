CREATE TABLE `order_thumbs` (
	`order_id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`jpeg` mediumblob NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `order_thumbs_order_id` PRIMARY KEY(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `print_jobs` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`kiosk_row_id` varchar(32) NOT NULL,
	`order_id` varchar(32) NOT NULL,
	`client_job_id` varchar(64) NOT NULL,
	`kind` enum('photo','badge','slip') NOT NULL,
	`status` enum('queued','printing','printed','failed','cancelled') NOT NULL,
	`printer` varchar(200),
	`error` varchar(500),
	`attempts` int NOT NULL DEFAULT 1,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`printed_at` datetime(3),
	CONSTRAINT `print_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `print_jobs_client_uq` UNIQUE(`kiosk_row_id`,`client_job_id`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `queue_no` varchar(16);--> statement-breakpoint
ALTER TABLE `orders` ADD `event_id` varchar(32);--> statement-breakpoint
ALTER TABLE `orders` ADD `has_thumb` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `print_jobs_org_time_idx` ON `print_jobs` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `print_jobs_order_idx` ON `print_jobs` (`order_id`);