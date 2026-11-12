CREATE TABLE `student_attendance` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`enrollmentId` bigint unsigned NOT NULL,
	`classSectionId` bigint unsigned NOT NULL,
	`attendanceDate` date NOT NULL,
	`status` varchar(20) NOT NULL,
	`note` varchar(500),
	`recordedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_attendance_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `student_attendance_school_student_date_uq` UNIQUE(`schoolId`,`studentId`,`attendanceDate`)
);
--> statement-breakpoint
ALTER TABLE `student_attendance` ADD CONSTRAINT `student_attendance_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_attendance` ADD CONSTRAINT `student_attendance_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_attendance` ADD CONSTRAINT `student_attendance_enrollmentId_student_enrollments_id_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `student_enrollments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_attendance` ADD CONSTRAINT `student_attendance_classSectionId_class_sections_id_fk` FOREIGN KEY (`classSectionId`) REFERENCES `class_sections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_attendance` ADD CONSTRAINT `student_attendance_recordedBy_user_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `student_attendance_school_section_date_idx` ON `student_attendance` (`schoolId`,`classSectionId`,`attendanceDate`);