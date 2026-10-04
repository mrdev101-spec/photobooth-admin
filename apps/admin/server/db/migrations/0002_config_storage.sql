CREATE TABLE `config_acks` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`kiosk_row_id` varchar(32) NOT NULL,
	`revision` int NOT NULL,
	`status` enum('applied','rejected') NOT NULL,
	`error` json,
	`applied_at` datetime(3),
	`received_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `config_acks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `org_storage` (
	`org_id` varchar(32) NOT NULL,
	`account_id` varchar(64) NOT NULL,
	`bucket` varchar(63) NOT NULL,
	`endpoint` varchar(255) NOT NULL DEFAULT '',
	`public_url` varchar(255) NOT NULL,
	`access_key_id_enc` text NOT NULL,
	`secret_access_key_enc` text NOT NULL,
	`key_hint` varchar(16) NOT NULL DEFAULT '',
	`lifecycle_days` int NOT NULL DEFAULT 7,
	`secrets_version` int NOT NULL DEFAULT 1,
	`last_test_at` datetime(3),
	`last_test_ok` boolean,
	`last_test_error` varchar(500),
	`updated_by` varchar(32),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `org_storage_org_id` PRIMARY KEY(`org_id`)
);
--> statement-breakpoint
ALTER TABLE `kiosks` ADD `config_error` json;--> statement-breakpoint
CREATE INDEX `config_acks_kiosk_idx` ON `config_acks` (`kiosk_row_id`,`revision`);