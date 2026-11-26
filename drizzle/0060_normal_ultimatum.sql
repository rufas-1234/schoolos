CREATE TABLE `student_elective_selections` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`studentEnrollmentId` bigint unsigned NOT NULL,
	`classSubjectId` bigint unsigned NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_elective_selections_id` PRIMARY KEY(`id`),
	CONSTRAINT `ses_school_enrollment_subject_uq` UNIQUE(`schoolId`,`studentEnrollmentId`,`classSubjectId`)
);
--> statement-breakpoint
ALTER TABLE `student_elective_selections` ADD CONSTRAINT `ses_school_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_elective_selections` ADD CONSTRAINT `ses_student_enrollment_fk` FOREIGN KEY (`studentEnrollmentId`) REFERENCES `student_enrollments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_elective_selections` ADD CONSTRAINT `ses_class_subject_fk` FOREIGN KEY (`classSubjectId`) REFERENCES `class_subjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ses_school_subject_status_idx` ON `student_elective_selections` (`schoolId`,`classSubjectId`,`status`);