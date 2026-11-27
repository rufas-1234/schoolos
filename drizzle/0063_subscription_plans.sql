CREATE TABLE `school_subscriptions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`planId` bigint unsigned NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'trialing',
	`billingMode` varchar(20) NOT NULL DEFAULT 'manual',
	`currentPeriodStart` timestamp,
	`currentPeriodEnd` timestamp,
	`trialEndsAt` timestamp,
	`graceUntil` timestamp,
	`cancelAtPeriodEnd` boolean NOT NULL DEFAULT false,
	`createdBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `school_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `school_subscriptions_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `school_subscriptions_school_uq` UNIQUE(`schoolId`)
);
--> statement-breakpoint
CREATE TABLE `subscription_invoices` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`subscriptionId` bigint unsigned NOT NULL,
	`invoiceNumber` varchar(48) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`dueAt` timestamp NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'open',
	`paidAt` timestamp,
	`paymentMethod` varchar(30),
	`paymentReference` varchar(120),
	`confirmedBy` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscription_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_invoices_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `subscription_invoices_school_number_uq` UNIQUE(`schoolId`,`invoiceNumber`),
	CONSTRAINT `subscription_invoices_subscription_period_uq` UNIQUE(`subscriptionId`,`periodStart`,`periodEnd`)
);
--> statement-breakpoint
CREATE TABLE `subscription_plans` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`code` varchar(48) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(1000),
	`billingInterval` varchar(20) NOT NULL DEFAULT 'monthly',
	`currency` varchar(3) NOT NULL DEFAULT 'KES',
	`amount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`studentLimit` int unsigned,
	`branchLimit` int unsigned,
	`trialDays` int unsigned NOT NULL DEFAULT 0,
	`includedModules` json NOT NULL,
	`isTrial` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int unsigned NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscription_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_plans_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `subscription_plans_code_interval_currency_uq` UNIQUE(`code`,`billingInterval`,`currency`)
);
--> statement-breakpoint
ALTER TABLE `school_subscriptions` ADD CONSTRAINT `school_subscriptions_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `school_subscriptions` ADD CONSTRAINT `school_subscriptions_planId_subscription_plans_id_fk` FOREIGN KEY (`planId`) REFERENCES `subscription_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `school_subscriptions` ADD CONSTRAINT `school_subscriptions_createdBy_user_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_invoices` ADD CONSTRAINT `subscription_invoices_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_invoices` ADD CONSTRAINT `subscription_invoices_subscriptionId_school_subscriptions_id_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `school_subscriptions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_invoices` ADD CONSTRAINT `subscription_invoices_confirmedBy_user_id_fk` FOREIGN KEY (`confirmedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `school_subscriptions_plan_status_idx` ON `school_subscriptions` (`planId`,`status`);--> statement-breakpoint
CREATE INDEX `school_subscriptions_period_end_idx` ON `school_subscriptions` (`status`,`currentPeriodEnd`);--> statement-breakpoint
CREATE INDEX `subscription_invoices_school_status_due_idx` ON `subscription_invoices` (`schoolId`,`status`,`dueAt`);--> statement-breakpoint
CREATE INDEX `subscription_plans_active_sort_idx` ON `subscription_plans` (`isActive`,`sortOrder`);
--> statement-breakpoint
INSERT IGNORE INTO `subscription_plans` (`publicId`,`code`,`name`,`description`,`billingInterval`,`currency`,`amount`,`studentLimit`,`branchLimit`,`trialDays`,`includedModules`,`isTrial`,`isActive`,`sortOrder`) VALUES ('00000000-0000-4000-8000-000000006301','trial','14-day trial','Full SchoolOS access during the workspace trial.','monthly','KES','0.00',NULL,NULL,14,JSON_ARRAY('all'),true,true,0);
