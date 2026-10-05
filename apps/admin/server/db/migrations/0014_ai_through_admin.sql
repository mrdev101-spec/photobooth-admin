CREATE TABLE `ai_job_files` (
	`job_id` varchar(32) NOT NULL,
	`role` enum('photo','crop','result') NOT NULL,
	`mime_type` varchar(20) NOT NULL,
	`bytes` mediumblob NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_job_files_job_id_role_pk` PRIMARY KEY(`job_id`,`role`)
);
--> statement-breakpoint
CREATE TABLE `ai_jobs` (
	`id` varchar(32) NOT NULL,
	`org_id` varchar(32) NOT NULL,
	`kiosk_row_id` varchar(32) NOT NULL,
	`request_id` varchar(64) NOT NULL,
	`scene_id` varchar(64) NOT NULL,
	`status` enum('queued','running','succeeded','failed') NOT NULL DEFAULT 'queued',
	`provider` varchar(20),
	`model` varchar(80),
	`image_size` varchar(4),
	`refined` boolean NOT NULL DEFAULT false,
	`error_code` varchar(16),
	`error_detail` varchar(500),
	`duration_ms` int,
	`month` char(7) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`started_at` datetime(3),
	`finished_at` datetime(3),
	CONSTRAINT `ai_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_jobs_request_uq` UNIQUE(`kiosk_row_id`,`request_id`)
);
--> statement-breakpoint
CREATE TABLE `ai_usage_monthly` (
	`org_id` varchar(32) NOT NULL,
	`month` char(7) NOT NULL,
	`images` int NOT NULL DEFAULT 0,
	`failed` int NOT NULL DEFAULT 0,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_usage_monthly_org_id_month_pk` PRIMARY KEY(`org_id`,`month`)
);
--> statement-breakpoint
CREATE TABLE `platform_ai_settings` (
	`id` int NOT NULL,
	`provider` enum('auto','openai','openrouter','google') NOT NULL DEFAULT 'auto',
	`openai_key_enc` text,
	`openrouter_key_enc` text,
	`google_key_enc` text,
	`openai_key_hint` varchar(16) NOT NULL DEFAULT '',
	`openrouter_key_hint` varchar(16) NOT NULL DEFAULT '',
	`google_key_hint` varchar(16) NOT NULL DEFAULT '',
	`openai_model` varchar(80),
	`openrouter_model` varchar(80),
	`google_model` varchar(80),
	`thai_text_model` varchar(80),
	`image_size` enum('1K','2K') NOT NULL DEFAULT '1K',
	`face_refine` boolean NOT NULL DEFAULT true,
	`last_test_at` datetime(3),
	`last_test_ok` boolean,
	`last_test_message` varchar(500),
	`updated_by` varchar(32),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `platform_ai_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ai_jobs_org_month_idx` ON `ai_jobs` (`org_id`,`month`,`status`);--> statement-breakpoint
CREATE INDEX `ai_jobs_status_idx` ON `ai_jobs` (`status`,`created_at`);