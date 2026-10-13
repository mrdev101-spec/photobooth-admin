CREATE TABLE `login_challenges` (
	`id` varchar(32) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`user_id` varchar(32) NOT NULL,
	`code_hash` char(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`sent_count` int NOT NULL DEFAULT 1,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `login_challenges_id` PRIMARY KEY(`id`),
	CONSTRAINT `login_challenges_token_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `trusted_devices` (
	`id` varchar(32) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`user_id` varchar(32) NOT NULL,
	`user_agent` varchar(255),
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `trusted_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `trusted_devices_token_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE INDEX `login_challenges_user_idx` ON `login_challenges` (`user_id`);--> statement-breakpoint
CREATE INDEX `trusted_devices_user_idx` ON `trusted_devices` (`user_id`);