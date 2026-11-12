CREATE TABLE `academic_holidays` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`academicYearId` bigint unsigned NOT NULL,
	`academicTermId` bigint unsigned,
	`name` varchar(120) NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `academic_holidays_id` PRIMARY KEY(`id`),
	CONSTRAINT `academic_holidays_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `academic_holidays_year_name_start_uq` UNIQUE(`schoolId`,`academicYearId`,`name`,`startDate`)
);
--> statement-breakpoint
CREATE TABLE `student_academic_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`fromEnrollmentId` bigint unsigned,
	`toEnrollmentId` bigint unsigned,
	`fromClassSectionId` bigint unsigned,
	`toClassSectionId` bigint unsigned,
	`eventType` varchar(30) NOT NULL,
	`eventDate` date NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`createdBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `student_academic_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_academic_events_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `student_enrollments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`academicYearId` bigint unsigned NOT NULL,
	`classSectionId` bigint unsigned NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'enrolled',
	`enrolledAt` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_enrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_enrollments_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `student_enrollments_school_student_year_uq` UNIQUE(`schoolId`,`studentId`,`academicYearId`)
);
--> statement-breakpoint
CREATE TABLE `teachers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`firstName` varchar(120) NOT NULL,
	`lastName` varchar(120) NOT NULL,
	`employeeCode` varchar(40),
	`email` varchar(320),
	`phone` varchar(40),
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teachers_id` PRIMARY KEY(`id`),
	CONSTRAINT `teachers_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `teachers_school_employee_code_uq` UNIQUE(`schoolId`,`employeeCode`)
);
--> statement-breakpoint
ALTER TABLE `academic_terms` ADD `examStartDate` date;--> statement-breakpoint
ALTER TABLE `academic_terms` ADD `examEndDate` date;--> statement-breakpoint
ALTER TABLE `academic_years` ADD `status` varchar(20) DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE `class_sections` ADD `capacity` int unsigned;--> statement-breakpoint
ALTER TABLE `class_sections` ADD `classTeacherId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `class_subjects` ADD `teacherId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `academic_holidays` ADD CONSTRAINT `academic_holidays_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `academic_holidays` ADD CONSTRAINT `academic_holidays_academicYearId_academic_years_id_fk` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `academic_holidays` ADD CONSTRAINT `academic_holidays_academicTermId_academic_terms_id_fk` FOREIGN KEY (`academicTermId`) REFERENCES `academic_terms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_academic_events` ADD CONSTRAINT `student_academic_events_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_academic_events` ADD CONSTRAINT `student_academic_events_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_academic_events` ADD CONSTRAINT `student_academic_events_from_enrollment_fk` FOREIGN KEY (`fromEnrollmentId`) REFERENCES `student_enrollments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_academic_events` ADD CONSTRAINT `student_academic_events_toEnrollmentId_student_enrollments_id_fk` FOREIGN KEY (`toEnrollmentId`) REFERENCES `student_enrollments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_academic_events` ADD CONSTRAINT `student_academic_events_fromClassSectionId_class_sections_id_fk` FOREIGN KEY (`fromClassSectionId`) REFERENCES `class_sections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_academic_events` ADD CONSTRAINT `student_academic_events_toClassSectionId_class_sections_id_fk` FOREIGN KEY (`toClassSectionId`) REFERENCES `class_sections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_academic_events` ADD CONSTRAINT `student_academic_events_createdBy_user_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_enrollments` ADD CONSTRAINT `student_enrollments_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_enrollments` ADD CONSTRAINT `student_enrollments_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_enrollments` ADD CONSTRAINT `student_enrollments_academicYearId_academic_years_id_fk` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_enrollments` ADD CONSTRAINT `student_enrollments_classSectionId_class_sections_id_fk` FOREIGN KEY (`classSectionId`) REFERENCES `class_sections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teachers` ADD CONSTRAINT `teachers_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `academic_holidays_school_year_dates_idx` ON `academic_holidays` (`schoolId`,`academicYearId`,`startDate`,`endDate`);--> statement-breakpoint
CREATE INDEX `student_academic_events_school_student_date_idx` ON `student_academic_events` (`schoolId`,`studentId`,`eventDate`);--> statement-breakpoint
CREATE INDEX `student_academic_events_from_enrollment_idx` ON `student_academic_events` (`fromEnrollmentId`);--> statement-breakpoint
CREATE INDEX `student_academic_events_to_enrollment_idx` ON `student_academic_events` (`toEnrollmentId`);--> statement-breakpoint
CREATE INDEX `student_enrollments_school_section_status_idx` ON `student_enrollments` (`schoolId`,`classSectionId`,`status`);--> statement-breakpoint
CREATE INDEX `student_enrollments_school_year_status_idx` ON `student_enrollments` (`schoolId`,`academicYearId`,`status`);--> statement-breakpoint
CREATE INDEX `teachers_school_status_name_idx` ON `teachers` (`schoolId`,`status`,`lastName`,`firstName`);--> statement-breakpoint
ALTER TABLE `class_sections` ADD CONSTRAINT `class_sections_classTeacherId_teachers_id_fk` FOREIGN KEY (`classTeacherId`) REFERENCES `teachers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_subjects` ADD CONSTRAINT `class_subjects_teacherId_teachers_id_fk` FOREIGN KEY (`teacherId`) REFERENCES `teachers`(`id`) ON DELETE no action ON UPDATE no action;