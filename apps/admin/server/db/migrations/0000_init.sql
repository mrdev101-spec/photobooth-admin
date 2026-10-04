CREATE TABLE `audit_logs` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32),
	`user_id` varchar(32),
	`acting_as_platform` boolean NOT NULL DEFAULT false,
	`action` varchar(64) NOT NULL,
	`resource_type` varchar(64) NOT NULL,
	`resource_id` varchar(64),
	`before` json,
	`after` json,
	`ip` varchar(64),
	`at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`name` varchar(120) NOT NULL,
	`address` varchar(500) NOT NULL DEFAULT '',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `branches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `membership_branches` (
	`org_id` varchar(32) NOT NULL,
	`user_id` varchar(32) NOT NULL,
	`branch_id` varchar(32) NOT NULL,
	CONSTRAINT `membership_branches_org_id_user_id_branch_id_pk` PRIMARY KEY(`org_id`,`user_id`,`branch_id`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`org_id` varchar(32) NOT NULL,
	`user_id` varchar(32) NOT NULL,
	`role` enum('owner','manager','designer','pickup_staff','viewer') NOT NULL,
	`all_branches` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `memberships_org_id_user_id_pk` PRIMARY KEY(`org_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` varchar(32) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`status` enum('active','suspended') NOT NULL DEFAULT 'active',
	`kiosk_quota` int NOT NULL DEFAULT 5,
	`ai_monthly_quota` int,
	`live_payments_allowed` boolean NOT NULL DEFAULT false,
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Bangkok',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` varchar(32) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`user_id` varchar(32) NOT NULL,
	`ip` varchar(64),
	`user_agent` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`expires_at` datetime(3) NOT NULL,
	`last_seen_at` datetime(3) NOT NULL,
	CONSTRAINT `user_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_sessions_token_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(32) NOT NULL,
	`email` varchar(254) NOT NULL,
	`name` varchar(120) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`must_change_password` boolean NOT NULL DEFAULT true,
	`platform_role` enum('platform_admin','platform_support'),
	`totp_secret_enc` text,
	`failed_logins` int NOT NULL DEFAULT 0,
	`locked_until` datetime(3),
	`last_login_at` datetime(3),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `audit_org_at_idx` ON `audit_logs` (`org_id`,`at`);--> statement-breakpoint
CREATE INDEX `audit_at_idx` ON `audit_logs` (`at`);--> statement-breakpoint
CREATE INDEX `branches_org_idx` ON `branches` (`org_id`,`name`);--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_sessions_user_idx` ON `user_sessions` (`user_id`);