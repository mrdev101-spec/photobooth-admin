CREATE TABLE `org_payment_accounts` (
	`org_id` varchar(32) NOT NULL,
	`active` boolean NOT NULL DEFAULT false,
	`method` enum('keys','connect') NOT NULL DEFAULT 'keys',
	`test_secret_enc` text,
	`test_webhook_enc` text,
	`live_secret_enc` text,
	`live_webhook_enc` text,
	`test_secret_hint` varchar(16) NOT NULL DEFAULT '',
	`live_secret_hint` varchar(16) NOT NULL DEFAULT '',
	`connect_account_id` varchar(64),
	`email` varchar(200) NOT NULL DEFAULT '',
	`account_name` varchar(120),
	`last_test_at` datetime(3),
	`last_test_ok` boolean,
	`last_test_message` varchar(500),
	`last_webhook_at` datetime(3),
	`updated_by` varchar(32),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `org_payment_accounts_org_id` PRIMARY KEY(`org_id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`kiosk_row_id` varchar(32) NOT NULL,
	`branch_id` varchar(32),
	`account` enum('platform','shop') NOT NULL,
	`mode` enum('test','live') NOT NULL,
	`stripe_intent_id` varchar(64) NOT NULL,
	`stripe_account_id` varchar(64),
	`amount` int NOT NULL,
	`product` varchar(100) NOT NULL DEFAULT '',
	`description` varchar(200) NOT NULL DEFAULT '',
	`status` enum('requires_action','processing','succeeded','canceled','failed') NOT NULL DEFAULT 'requires_action',
	`confirmed_by` enum('webhook','poll'),
	`fee_satang` int,
	`net_satang` int,
	`used_by` varchar(40),
	`expires_at` datetime(3) NOT NULL,
	`paid_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_intent_uq` UNIQUE(`stripe_intent_id`),
	CONSTRAINT `payments_used_by_uq` UNIQUE(`used_by`)
);
--> statement-breakpoint
CREATE TABLE `platform_payment_settings` (
	`id` int NOT NULL,
	`test_secret_enc` text,
	`test_webhook_enc` text,
	`live_secret_enc` text,
	`live_webhook_enc` text,
	`test_secret_hint` varchar(16) NOT NULL DEFAULT '',
	`live_secret_hint` varchar(16) NOT NULL DEFAULT '',
	`email` varchar(200) NOT NULL DEFAULT '',
	`last_test_at` datetime(3),
	`last_test_ok` boolean,
	`last_test_message` varchar(500),
	`last_webhook_at` datetime(3),
	`updated_by` varchar(32),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `platform_payment_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `organizations` ADD `own_stripe_allowed` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_org_idx` ON `payments` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`,`expires_at`);