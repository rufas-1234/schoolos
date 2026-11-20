CREATE TABLE `school_currencies` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`code` varchar(3) NOT NULL,
	`name` varchar(120) NOT NULL,
	`symbol` varchar(12) NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `school_currencies_id` PRIMARY KEY(`id`),
	CONSTRAINT `school_currencies_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `school_currencies_school_code_uq` UNIQUE(`schoolId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `account_transactions` ADD `currency` varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `fee_discounts` ADD `currency` varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `fee_structures` ADD `currency` varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `fund_transfers` ADD `currency` varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_bank_accounts` ADD `currency` varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_fee_invoices` ADD `currency` varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `fee_advance_transactions` ADD `currency` varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_currencies` ADD CONSTRAINT `school_currencies_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `school_currencies_school_default_idx` ON `school_currencies` (`schoolId`,`isDefault`);--> statement-breakpoint
INSERT INTO `school_currencies` (`publicId`, `schoolId`, `code`, `name`, `symbol`, `isDefault`)
SELECT UUID(), `id`, `currency`, `currency`, `currency`, true FROM `schools`;--> statement-breakpoint
UPDATE `fee_structures` AS f JOIN `schools` AS s ON s.`id` = f.`schoolId`
SET f.`currency` = s.`currency`;--> statement-breakpoint
UPDATE `fee_discounts` AS f JOIN `schools` AS s ON s.`id` = f.`schoolId`
SET f.`currency` = s.`currency`;--> statement-breakpoint
UPDATE `student_fee_invoices` AS i JOIN `fee_structures` AS f ON f.`id` = i.`feeStructureId`
SET i.`currency` = f.`currency`;--> statement-breakpoint
UPDATE `school_bank_accounts` AS b JOIN `schools` AS s ON s.`id` = b.`schoolId`
SET b.`currency` = s.`currency`;--> statement-breakpoint
UPDATE `account_transactions` AS a JOIN `schools` AS s ON s.`id` = a.`schoolId`
LEFT JOIN `school_bank_accounts` AS b ON b.`id` = a.`bankAccountId`
SET a.`currency` = COALESCE(b.`currency`, s.`currency`);--> statement-breakpoint
UPDATE `fund_transfers` AS t JOIN `school_bank_accounts` AS b ON b.`id` = t.`sourceBankAccountId`
SET t.`currency` = b.`currency`;--> statement-breakpoint
UPDATE `fee_advance_transactions` AS a JOIN `schools` AS s ON s.`id` = a.`schoolId`
LEFT JOIN `student_fee_invoices` AS i ON i.`id` = a.`invoiceId`
SET a.`currency` = COALESCE(i.`currency`, s.`currency`);