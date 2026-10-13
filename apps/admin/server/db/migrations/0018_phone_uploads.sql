CREATE TABLE `phone_upload_files` (
	`upload_id` varchar(32) NOT NULL,
	`idx` int NOT NULL,
	`mime_type` varchar(20) NOT NULL,
	`bytes` mediumblob NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `phone_upload_files_upload_id_idx_pk` PRIMARY KEY(`upload_id`,`idx`)
);
--> statement-breakpoint
CREATE TABLE `phone_uploads` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`kiosk_row_id` varchar(32) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`count` int NOT NULL,
	`received` int NOT NULL DEFAULT 0,
	`status` enum('waiting','uploading','ready','taken','cancelled') NOT NULL DEFAULT 'waiting',
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `phone_uploads_id` PRIMARY KEY(`id`),
	CONSTRAINT `phone_uploads_token_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE INDEX `phone_uploads_expires_idx` ON `phone_uploads` (`expires_at`);