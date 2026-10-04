CREATE TABLE `kiosk_config_revisions` (
	`kiosk_row_id` varchar(32) NOT NULL,
	`revision` int NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`settings` json NOT NULL,
	`note` varchar(255) NOT NULL DEFAULT '',
	`created_by` varchar(32),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `kiosk_config_revisions_kiosk_row_id_revision_pk` PRIMARY KEY(`kiosk_row_id`,`revision`)
);
--> statement-breakpoint
CREATE TABLE `kiosk_pair_codes` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`kiosk_row_id` varchar(32) NOT NULL,
	`code_hash` char(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	`created_by` varchar(32),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `kiosk_pair_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `kiosk_pair_codes_hash_uq` UNIQUE(`code_hash`)
);
--> statement-breakpoint
CREATE TABLE `kiosk_tokens` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`kiosk_row_id` varchar(32) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`last_used_at` datetime(3),
	`revoked_at` datetime(3),
	CONSTRAINT `kiosk_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `kiosk_tokens_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `kiosks` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`branch_id` varchar(32),
	`kiosk_id` varchar(16),
	`former_kiosk_id` varchar(16),
	`name` varchar(100) NOT NULL,
	`status` enum('pending','active','revoked') NOT NULL DEFAULT 'pending',
	`fingerprint` char(16),
	`reported_fingerprint` char(16),
	`fingerprint_mismatch` boolean NOT NULL DEFAULT false,
	`hostname` varchar(255),
	`app_version` varchar(40),
	`ip` varchar(64),
	`mode` varchar(16),
	`screen` varchar(64),
	`current_revision` int NOT NULL DEFAULT 0,
	`applied_revision` int,
	`maintenance` boolean NOT NULL DEFAULT false,
	`queue_depth` int NOT NULL DEFAULT 0,
	`printer_state` json,
	`camera_state` json,
	`local_settings` json,
	`last_seen_at` datetime(3),
	`paired_at` datetime(3),
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `kiosks_id` PRIMARY KEY(`id`),
	CONSTRAINT `kiosks_kiosk_id_uq` UNIQUE(`kiosk_id`)
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` varchar(128) NOT NULL,
	`window_start` datetime(3) NOT NULL,
	`count` int NOT NULL,
	CONSTRAINT `rate_limits_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE INDEX `kiosk_config_org_idx` ON `kiosk_config_revisions` (`org_id`);--> statement-breakpoint
CREATE INDEX `kiosk_pair_codes_kiosk_idx` ON `kiosk_pair_codes` (`kiosk_row_id`);--> statement-breakpoint
CREATE INDEX `kiosk_tokens_kiosk_idx` ON `kiosk_tokens` (`kiosk_row_id`);--> statement-breakpoint
CREATE INDEX `kiosks_org_idx` ON `kiosks` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `kiosks_org_branch_idx` ON `kiosks` (`org_id`,`branch_id`);