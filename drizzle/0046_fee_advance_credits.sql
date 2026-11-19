CREATE TABLE `fee_advance_transactions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`invoiceId` bigint unsigned,
	`paymentId` bigint unsigned,
	`transactionType` varchar(20) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`receiptNumber` varchar(40),
	`idempotencyKey` varchar(64) NOT NULL,
	`paymentMethod` varchar(30),
	`reference` varchar(120),
	`notes` varchar(500),
	`recordedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fee_advance_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `fee_advance_transactions_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `fee_advance_transactions_school_receipt_uq` UNIQUE(`schoolId`,`receiptNumber`),
	CONSTRAINT `fee_advance_transactions_school_idempotency_uq` UNIQUE(`schoolId`,`idempotencyKey`)
);
--> statement-breakpoint
ALTER TABLE `fee_advance_transactions` ADD CONSTRAINT `fee_advance_transactions_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_advance_transactions` ADD CONSTRAINT `fee_advance_transactions_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_advance_transactions` ADD CONSTRAINT `fee_advance_transactions_invoiceId_student_fee_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `student_fee_invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_advance_transactions` ADD CONSTRAINT `fee_advance_transactions_paymentId_fee_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `fee_payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_advance_transactions` ADD CONSTRAINT `fee_advance_transactions_recordedBy_user_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `fee_advance_transactions_school_student_idx` ON `fee_advance_transactions` (`schoolId`,`studentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `fee_advance_transactions_school_invoice_idx` ON `fee_advance_transactions` (`schoolId`,`invoiceId`);--> statement-breakpoint
CREATE INDEX `fee_advance_transactions_school_payment_idx` ON `fee_advance_transactions` (`schoolId`,`paymentId`);
