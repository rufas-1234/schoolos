CREATE TABLE `fee_discounts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`code` varchar(40) NOT NULL,
	`description` varchar(1000),
	`discountType` varchar(20) NOT NULL,
	`value` decimal(10,2) NOT NULL,
	`frequency` varchar(20) NOT NULL DEFAULT 'yearly',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fee_discounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `fee_discounts_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `fee_discounts_school_name_uq` UNIQUE(`schoolId`,`name`),
	CONSTRAINT `fee_discounts_school_code_uq` UNIQUE(`schoolId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `fee_groups` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(1000),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fee_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `fee_groups_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `fee_groups_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `fee_payments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`invoiceId` bigint unsigned NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`fineAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`paymentMethod` varchar(30) NOT NULL,
	`reference` varchar(120),
	`notes` varchar(500),
	`paidAt` timestamp NOT NULL DEFAULT (now()),
	`recordedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fee_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `fee_payments_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `fee_structures` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned NOT NULL,
	`academicYearId` bigint unsigned NOT NULL,
	`classLevelId` bigint unsigned NOT NULL,
	`feeGroupId` bigint unsigned NOT NULL,
	`feeTypeId` bigint unsigned NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`dueDate` date NOT NULL,
	`fineType` varchar(20) NOT NULL DEFAULT 'none',
	`fineValue` decimal(10,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fee_structures_id` PRIMARY KEY(`id`),
	CONSTRAINT `fee_structures_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `fee_structures_school_year_class_group_type_uq` UNIQUE(`schoolId`,`academicYearId`,`classLevelId`,`feeGroupId`,`feeTypeId`)
);
--> statement-breakpoint
CREATE TABLE `fee_types` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`feeGroupId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(1000),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fee_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `fee_types_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `fee_types_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `student_fee_discounts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`feeTypeId` bigint unsigned NOT NULL,
	`discountId` bigint unsigned NOT NULL,
	`note` varchar(500),
	`assignedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_fee_discounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_fee_discounts_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `student_fee_discounts_school_student_type_uq` UNIQUE(`schoolId`,`studentId`,`feeTypeId`)
);
--> statement-breakpoint
CREATE TABLE `student_fee_invoices` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`enrollmentId` bigint unsigned NOT NULL,
	`feeStructureId` bigint unsigned NOT NULL,
	`discountId` bigint unsigned,
	`amount` decimal(12,2) NOT NULL,
	`discountAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`fineType` varchar(20) NOT NULL DEFAULT 'none',
	`fineValue` decimal(10,2) NOT NULL DEFAULT '0',
	`dueDate` date NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'unpaid',
	`generatedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_fee_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_fee_invoices_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `student_fee_invoices_school_enrollment_structure_uq` UNIQUE(`schoolId`,`enrollmentId`,`feeStructureId`)
);
--> statement-breakpoint
ALTER TABLE `staff_departments` DROP INDEX `staff_departments_school_name_uq`;--> statement-breakpoint
ALTER TABLE `staff_designations` DROP INDEX `staff_designations_school_name_uq`;--> statement-breakpoint
ALTER TABLE `staff_leave_types` DROP INDEX `staff_leave_types_school_name_uq`;--> statement-breakpoint
ALTER TABLE `staff_departments` ADD `branchId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `staff_designations` ADD `branchId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `staff_leave_types` ADD `branchId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `staff_departments` ADD CONSTRAINT `staff_departments_school_branch_name_uq` UNIQUE(`schoolId`,`branchId`,`name`);--> statement-breakpoint
ALTER TABLE `staff_designations` ADD CONSTRAINT `staff_designations_school_branch_name_uq` UNIQUE(`schoolId`,`branchId`,`name`);--> statement-breakpoint
ALTER TABLE `staff_leave_types` ADD CONSTRAINT `staff_leave_types_school_branch_name_uq` UNIQUE(`schoolId`,`branchId`,`name`);--> statement-breakpoint
ALTER TABLE `fee_discounts` ADD CONSTRAINT `fee_discounts_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_groups` ADD CONSTRAINT `fee_groups_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_payments` ADD CONSTRAINT `fee_payments_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_payments` ADD CONSTRAINT `fee_payments_invoiceId_student_fee_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `student_fee_invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_payments` ADD CONSTRAINT `fee_payments_recordedBy_user_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_structures` ADD CONSTRAINT `fee_structures_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_structures` ADD CONSTRAINT `fee_structures_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_structures` ADD CONSTRAINT `fee_structures_academicYearId_academic_years_id_fk` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_structures` ADD CONSTRAINT `fee_structures_classLevelId_class_levels_id_fk` FOREIGN KEY (`classLevelId`) REFERENCES `class_levels`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_structures` ADD CONSTRAINT `fee_structures_feeGroupId_fee_groups_id_fk` FOREIGN KEY (`feeGroupId`) REFERENCES `fee_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_structures` ADD CONSTRAINT `fee_structures_feeTypeId_fee_types_id_fk` FOREIGN KEY (`feeTypeId`) REFERENCES `fee_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_types` ADD CONSTRAINT `fee_types_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_types` ADD CONSTRAINT `fee_types_feeGroupId_fee_groups_id_fk` FOREIGN KEY (`feeGroupId`) REFERENCES `fee_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_fee_discounts` ADD CONSTRAINT `student_fee_discounts_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_fee_discounts` ADD CONSTRAINT `student_fee_discounts_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_fee_discounts` ADD CONSTRAINT `student_fee_discounts_feeTypeId_fee_types_id_fk` FOREIGN KEY (`feeTypeId`) REFERENCES `fee_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_fee_discounts` ADD CONSTRAINT `student_fee_discounts_discountId_fee_discounts_id_fk` FOREIGN KEY (`discountId`) REFERENCES `fee_discounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_fee_discounts` ADD CONSTRAINT `student_fee_discounts_assignedBy_user_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_fee_invoices` ADD CONSTRAINT `student_fee_invoices_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_fee_invoices` ADD CONSTRAINT `student_fee_invoices_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_fee_invoices` ADD CONSTRAINT `student_fee_invoices_enrollmentId_student_enrollments_id_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `student_enrollments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_fee_invoices` ADD CONSTRAINT `student_fee_invoices_feeStructureId_fee_structures_id_fk` FOREIGN KEY (`feeStructureId`) REFERENCES `fee_structures`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_fee_invoices` ADD CONSTRAINT `student_fee_invoices_discountId_fee_discounts_id_fk` FOREIGN KEY (`discountId`) REFERENCES `fee_discounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_fee_invoices` ADD CONSTRAINT `student_fee_invoices_generatedBy_user_id_fk` FOREIGN KEY (`generatedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `fee_discounts_school_idx` ON `fee_discounts` (`schoolId`);--> statement-breakpoint
CREATE INDEX `fee_groups_school_idx` ON `fee_groups` (`schoolId`);--> statement-breakpoint
CREATE INDEX `fee_payments_school_paid_at_idx` ON `fee_payments` (`schoolId`,`paidAt`);--> statement-breakpoint
CREATE INDEX `fee_payments_school_invoice_idx` ON `fee_payments` (`schoolId`,`invoiceId`);--> statement-breakpoint
CREATE INDEX `fee_structures_school_branch_year_idx` ON `fee_structures` (`schoolId`,`branchId`,`academicYearId`);--> statement-breakpoint
CREATE INDEX `fee_types_school_group_idx` ON `fee_types` (`schoolId`,`feeGroupId`);--> statement-breakpoint
CREATE INDEX `student_fee_discounts_school_discount_idx` ON `student_fee_discounts` (`schoolId`,`discountId`);--> statement-breakpoint
CREATE INDEX `student_fee_invoices_school_status_due_idx` ON `student_fee_invoices` (`schoolId`,`status`,`dueDate`);--> statement-breakpoint
CREATE INDEX `student_fee_invoices_school_student_idx` ON `student_fee_invoices` (`schoolId`,`studentId`);--> statement-breakpoint
ALTER TABLE `staff_departments` ADD CONSTRAINT `staff_departments_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_designations` ADD CONSTRAINT `staff_designations_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_leave_types` ADD CONSTRAINT `staff_leave_types_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;