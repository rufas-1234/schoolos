CREATE TABLE `exam_fee_clearances` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`examinationId` bigint unsigned NOT NULL,
	`enrollmentId` bigint unsigned NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`approvedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_fee_clearances_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_fee_clearances_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `exam_fee_clearances_school_exam_enrollment_uq` UNIQUE(`schoolId`,`examinationId`,`enrollmentId`)
);
--> statement-breakpoint
ALTER TABLE `exam_fee_clearances` ADD CONSTRAINT `exam_fee_clearances_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_fee_clearances` ADD CONSTRAINT `exam_fee_clearances_examinationId_examinations_id_fk` FOREIGN KEY (`examinationId`) REFERENCES `examinations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_fee_clearances` ADD CONSTRAINT `exam_fee_clearances_enrollmentId_student_enrollments_id_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `student_enrollments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_fee_clearances` ADD CONSTRAINT `exam_fee_clearances_approvedBy_user_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `exam_fee_clearances_school_exam_idx` ON `exam_fee_clearances` (`schoolId`,`examinationId`);