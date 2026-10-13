ALTER TABLE `org_payment_accounts` ADD `test_kiosk_key_enc` text;--> statement-breakpoint
ALTER TABLE `org_payment_accounts` ADD `live_kiosk_key_enc` text;--> statement-breakpoint
ALTER TABLE `org_payment_accounts` ADD `test_kiosk_key_hint` varchar(8) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `org_payment_accounts` ADD `live_kiosk_key_hint` varchar(8) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `platform_payment_settings` ADD `test_kiosk_key_enc` text;--> statement-breakpoint
ALTER TABLE `platform_payment_settings` ADD `live_kiosk_key_enc` text;--> statement-breakpoint
ALTER TABLE `platform_payment_settings` ADD `test_kiosk_key_hint` varchar(8) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `platform_payment_settings` ADD `live_kiosk_key_hint` varchar(8) DEFAULT '' NOT NULL;