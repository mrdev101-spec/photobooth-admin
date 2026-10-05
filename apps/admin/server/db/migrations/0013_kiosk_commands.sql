CREATE TABLE `kiosk_commands` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`kiosk_row_id` varchar(32) NOT NULL,
	`type` enum('reprint','cancel_print') NOT NULL,
	`payload` json NOT NULL,
	`status` enum('pending','sent','done','failed') NOT NULL DEFAULT 'pending',
	`message` varchar(500),
	`created_by` varchar(32),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`sent_at` datetime(3),
	`done_at` datetime(3),
	CONSTRAINT `kiosk_commands_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `kiosk_commands_kiosk_idx` ON `kiosk_commands` (`kiosk_row_id`,`status`);--> statement-breakpoint
CREATE INDEX `kiosk_commands_org_idx` ON `kiosk_commands` (`org_id`,`created_at`);