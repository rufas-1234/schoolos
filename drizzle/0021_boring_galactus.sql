CREATE TABLE `fee_payment_reversals` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`paymentId` bigint unsigned NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`reversalType` varchar(20) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`reference` varchar(120),
	`idempotencyKey` varchar(64) NOT NULL,
	`recordedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fee_payment_reversals_id` PRIMARY KEY(`id`),
	CONSTRAINT `fee_payment_reversals_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `fee_payment_reversals_school_idempotency_uq` UNIQUE(`schoolId`,`idempotencyKey`)
);
--> statement-breakpoint
ALTER TABLE `class_levels` ADD `status` varchar(20) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `fee_payments` ADD `receiptNumber` varchar(40);--> statement-breakpoint
UPDATE `fee_payments` SET `receiptNumber` = CONCAT('RCT-', UPPER(SUBSTRING(REPLACE(`publicId`, '-', ''), 1, 12))) WHERE `receiptNumber` IS NULL;--> statement-breakpoint
ALTER TABLE `fee_payments` MODIFY `receiptNumber` varchar(40) NOT NULL;--> statement-breakpoint
ALTER TABLE `fee_payments` ADD `idempotencyKey` varchar(64);--> statement-breakpoint
UPDATE `fee_payments` SET `idempotencyKey` = CONCAT('LEGACY-', `publicId`) WHERE `idempotencyKey` IS NULL;--> statement-breakpoint
ALTER TABLE `fee_payments` MODIFY `idempotencyKey` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `fee_payments` ADD `reversedAmount` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `fee_structures` ADD `academicTermId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `student_fee_invoices` ADD `invoiceNumber` varchar(40);--> statement-breakpoint
UPDATE `student_fee_invoices` SET `invoiceNumber` = CONCAT('INV-', UPPER(SUBSTRING(REPLACE(`publicId`, '-', ''), 1, 12))) WHERE `invoiceNumber` IS NULL;--> statement-breakpoint
ALTER TABLE `student_fee_invoices` MODIFY `invoiceNumber` varchar(40) NOT NULL;--> statement-breakpoint
ALTER TABLE `fee_payments` ADD CONSTRAINT `fee_payments_school_receipt_uq` UNIQUE(`schoolId`,`receiptNumber`);--> statement-breakpoint
ALTER TABLE `fee_payments` ADD CONSTRAINT `fee_payments_school_idempotency_uq` UNIQUE(`schoolId`,`idempotencyKey`);--> statement-breakpoint
ALTER TABLE `student_fee_invoices` ADD CONSTRAINT `student_fee_invoices_school_number_uq` UNIQUE(`schoolId`,`invoiceNumber`);--> statement-breakpoint
ALTER TABLE `fee_payment_reversals` ADD CONSTRAINT `fee_payment_reversals_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_payment_reversals` ADD CONSTRAINT `fee_payment_reversals_paymentId_fee_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `fee_payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_payment_reversals` ADD CONSTRAINT `fee_payment_reversals_recordedBy_user_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `fee_payment_reversals_school_payment_idx` ON `fee_payment_reversals` (`schoolId`,`paymentId`);--> statement-breakpoint
ALTER TABLE `fee_structures` ADD CONSTRAINT `fee_structures_academicTermId_academic_terms_id_fk` FOREIGN KEY (`academicTermId`) REFERENCES `academic_terms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `fee_structures_school_term_idx` ON `fee_structures` (`schoolId`,`academicTermId`);