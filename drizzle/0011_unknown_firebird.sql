CREATE TABLE `student_categories` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_categories_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `student_categories_school_branch_name_uq` UNIQUE(`schoolId`,`branchId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `student_enrollments` ADD `rollNumber` varchar(40);--> statement-breakpoint
ALTER TABLE `students` ADD `branchId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `students` ADD `categoryId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `students` ADD `admissionNumber` varchar(40);--> statement-breakpoint
ALTER TABLE `students` ADD `dateOfBirth` date;--> statement-breakpoint
ALTER TABLE `students` ADD `admissionDate` date;--> statement-breakpoint
ALTER TABLE `students` ADD `religion` varchar(100);--> statement-breakpoint
ALTER TABLE `students` ADD `bloodGroup` varchar(3);--> statement-breakpoint
ALTER TABLE `students` ADD `currentAddress` varchar(1000);--> statement-breakpoint
ALTER TABLE `students` ADD `permanentAddress` varchar(1000);--> statement-breakpoint
ALTER TABLE `students` ADD `fatherName` varchar(160);--> statement-breakpoint
ALTER TABLE `students` ADD `fatherOccupation` varchar(120);--> statement-breakpoint
ALTER TABLE `students` ADD `fatherPhone` varchar(40);--> statement-breakpoint
ALTER TABLE `students` ADD `motherName` varchar(160);--> statement-breakpoint
ALTER TABLE `students` ADD `motherOccupation` varchar(120);--> statement-breakpoint
ALTER TABLE `students` ADD `motherPhone` varchar(40);--> statement-breakpoint
ALTER TABLE `students` ADD `guardianName` varchar(160);--> statement-breakpoint
ALTER TABLE `students` ADD `guardianRelation` varchar(80);--> statement-breakpoint
ALTER TABLE `students` ADD `guardianEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `students` ADD `guardianPhone` varchar(40);--> statement-breakpoint
ALTER TABLE `students` ADD `guardianOccupation` varchar(120);--> statement-breakpoint
ALTER TABLE `students` ADD `guardianAddress` varchar(1000);--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_school_admission_number_uq` UNIQUE(`schoolId`,`admissionNumber`);--> statement-breakpoint
ALTER TABLE `student_categories` ADD CONSTRAINT `student_categories_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_categories` ADD CONSTRAINT `student_categories_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `student_categories_school_branch_idx` ON `student_categories` (`schoolId`,`branchId`);--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_categoryId_student_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `student_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `students_school_category_idx` ON `students` (`schoolId`,`categoryId`);