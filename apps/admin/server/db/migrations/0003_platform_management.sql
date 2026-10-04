ALTER TABLE `kiosks` MODIFY COLUMN `status` enum('pending','active','disabled','revoked') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `kiosk_quota` int DEFAULT 5;--> statement-breakpoint
ALTER TABLE `kiosks` ADD `disabled_reason` varchar(255);--> statement-breakpoint
ALTER TABLE `kiosks` ADD `disabled_at` datetime(3);--> statement-breakpoint
ALTER TABLE `organizations` ADD `user_quota` int DEFAULT 3;--> statement-breakpoint
ALTER TABLE `organizations` ADD `customer_can_add_kiosks` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `config_permissions` json;