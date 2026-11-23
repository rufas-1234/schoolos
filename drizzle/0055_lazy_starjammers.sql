CREATE TABLE `student_certificates` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`academicYearId` bigint unsigned NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`certificateNumber` varchar(48) NOT NULL,
	`category` varchar(120) NOT NULL,
	`title` varchar(160) NOT NULL,
	`achievement` varchar(2000) NOT NULL,
	`issuedAt` date NOT NULL,
	`issuedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `student_certificates_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_certificates_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `student_certificates_school_number_uq` UNIQUE(`schoolId`,`certificateNumber`)
);
--> statement-breakpoint
ALTER TABLE `student_certificates` ADD CONSTRAINT `student_certificates_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_certificates` ADD CONSTRAINT `student_certificates_academicYearId_academic_years_id_fk` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_certificates` ADD CONSTRAINT `student_certificates_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_certificates` ADD CONSTRAINT `student_certificates_issuedBy_user_id_fk` FOREIGN KEY (`issuedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `student_certificates_school_year_issued_idx` ON `student_certificates` (`schoolId`,`academicYearId`,`issuedAt`);--> statement-breakpoint
CREATE INDEX `student_certificates_school_student_year_idx` ON `student_certificates` (`schoolId`,`studentId`,`academicYearId`);--> statement-breakpoint
CREATE INDEX `student_certificates_school_category_idx` ON `student_certificates` (`schoolId`,`category`);