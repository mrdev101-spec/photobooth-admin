ALTER TABLE `organizations` MODIFY COLUMN `ai_monthly_quota` int DEFAULT 300;--> statement-breakpoint
-- Shops that had no limit get the new default (the platform can still raise it or set it unlimited)
UPDATE `organizations` SET `ai_monthly_quota` = 300 WHERE `ai_monthly_quota` IS NULL AND `kind` = 'customer';
