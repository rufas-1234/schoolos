CREATE TABLE `exam_report_signatures` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`role` varchar(30) NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`fileName` varchar(160) NOT NULL,
	`contentType` varchar(100) NOT NULL,
	`updatedBy` varchar(36) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_report_signatures_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_report_signatures_school_role_uq` UNIQUE(`schoolId`,`role`)
);
--> statement-breakpoint
CREATE TABLE `library_categories` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned,
	`name` varchar(120) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `library_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `library_categories_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `library_categories_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `library_members` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned,
	`studentId` bigint unsigned NOT NULL,
	`memberNumber` varchar(40) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `library_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `library_members_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `library_members_school_student_uq` UNIQUE(`schoolId`,`studentId`),
	CONSTRAINT `library_members_school_number_uq` UNIQUE(`schoolId`,`memberNumber`)
);
--> statement-breakpoint
CREATE TABLE `library_subjects` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned,
	`name` varchar(120) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `library_subjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `library_subjects_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `library_subjects_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `library_books` ADD `branchId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `library_books` ADD `categoryId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `library_books` ADD `subjectId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `library_books` ADD `bookNumber` varchar(40);--> statement-breakpoint
ALTER TABLE `library_books` ADD `description` varchar(1000);--> statement-breakpoint
ALTER TABLE `library_books` ADD `price` decimal(12,2);--> statement-breakpoint
ALTER TABLE `library_loans` ADD `memberId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `library_books` ADD CONSTRAINT `library_books_school_number_uq` UNIQUE(`schoolId`,`bookNumber`);--> statement-breakpoint
ALTER TABLE `exam_report_signatures` ADD CONSTRAINT `exam_report_signatures_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_report_signatures` ADD CONSTRAINT `exam_report_signatures_updatedBy_user_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_categories` ADD CONSTRAINT `library_categories_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_categories` ADD CONSTRAINT `library_categories_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_members` ADD CONSTRAINT `library_members_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_members` ADD CONSTRAINT `library_members_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_members` ADD CONSTRAINT `library_members_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_subjects` ADD CONSTRAINT `library_subjects_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_subjects` ADD CONSTRAINT `library_subjects_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `library_categories_school_status_idx` ON `library_categories` (`schoolId`,`status`);--> statement-breakpoint
CREATE INDEX `library_members_school_branch_status_idx` ON `library_members` (`schoolId`,`branchId`,`status`);--> statement-breakpoint
CREATE INDEX `library_subjects_school_status_idx` ON `library_subjects` (`schoolId`,`status`);--> statement-breakpoint
ALTER TABLE `library_books` ADD CONSTRAINT `library_books_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_books` ADD CONSTRAINT `library_books_categoryId_library_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `library_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_books` ADD CONSTRAINT `library_books_subjectId_library_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `library_subjects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_loans` ADD CONSTRAINT `library_loans_memberId_library_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `library_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `library_books_school_category_idx` ON `library_books` (`schoolId`,`categoryId`);--> statement-breakpoint
CREATE INDEX `library_books_school_subject_idx` ON `library_books` (`schoolId`,`subjectId`);