CREATE TABLE `catalog_templates` (
	`id` varchar(64) NOT NULL,
	`kind` enum('photo-4x6','badge','classic','ai-scene') NOT NULL,
	`source` enum('builtin','uploaded') NOT NULL DEFAULT 'builtin',
	`status` enum('published','retired') NOT NULL DEFAULT 'published',
	`updated_by` varchar(32),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `catalog_templates_kind_id_pk` PRIMARY KEY(`kind`,`id`)
);
--> statement-breakpoint
CREATE TABLE `order_files` (
	`id` varchar(32) NOT NULL,
	`order_id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`kind` enum('photo','badge','shot','ai','receipt') NOT NULL,
	`url` varchar(1000) NOT NULL,
	`r2_key` varchar(500),
	`width` int,
	`height` int,
	CONSTRAINT `order_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`branch_id` varchar(32),
	`kiosk_row_id` varchar(32) NOT NULL,
	`client_order_id` varchar(64) NOT NULL,
	`code` char(6),
	`mode` varchar(16) NOT NULL,
	`product` varchar(40) NOT NULL,
	`template_id` varchar(64),
	`badge` json,
	`items` json NOT NULL,
	`amount_satang` int NOT NULL DEFAULT 0,
	`payment_kind` enum('live','test','simulated','free') NOT NULL,
	`payment_ref` varchar(80),
	`fulfillment` enum('kiosk','pickup') NOT NULL,
	`status` enum('uploaded','printed_at_kiosk','claimed','handed_over','expired','cancelled') NOT NULL,
	`download_url` varchar(1000),
	`ordered_at` datetime(3) NOT NULL,
	`received_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`expires_at` datetime(3),
	`printed_at` datetime(3),
	`claimed_at` datetime(3),
	`claimed_by` varchar(32),
	`claimed_station` varchar(60),
	`handed_over_at` datetime(3),
	`reprint_allowance` int NOT NULL DEFAULT 0,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_code_uq` UNIQUE(`code`),
	CONSTRAINT `orders_client_uq` UNIQUE(`kiosk_row_id`,`client_order_id`)
);
--> statement-breakpoint
CREATE INDEX `order_files_order_idx` ON `order_files` (`order_id`);--> statement-breakpoint
CREATE INDEX `orders_org_time_idx` ON `orders` (`org_id`,`ordered_at`);--> statement-breakpoint
CREATE INDEX `orders_org_status_idx` ON `orders` (`org_id`,`status`,`ordered_at`);