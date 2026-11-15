CREATE TABLE `exam_attendance` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`examSubjectId` bigint unsigned NOT NULL,
	`enrollmentId` bigint unsigned NOT NULL,
	`status` varchar(20) NOT NULL,
	`note` varchar(500),
	`updatedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_attendance_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `exam_attendance_school_subject_enrollment_uq` UNIQUE(`schoolId`,`examSubjectId`,`enrollmentId`)
);
--> statement-breakpoint
CREATE TABLE `exam_types` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`averagePassing` boolean NOT NULL DEFAULT false,
	`averageMark` decimal(8,2) NOT NULL DEFAULT '0',
	`createdBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_types_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `exam_types_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `examinations` ADD `examTypeId` bigint unsigned;--> statement-breakpoint
INSERT INTO `exam_types` (`publicId`, `schoolId`, `name`, `averagePassing`, `averageMark`, `createdBy`)
SELECT UUID(), `schoolId`, `name`, false, 0, MIN(`createdBy`)
FROM `examinations`
GROUP BY `schoolId`, `name`;--> statement-breakpoint
UPDATE `examinations` e
INNER JOIN `exam_types` t ON t.`schoolId` = e.`schoolId` AND t.`name` = e.`name`
SET e.`examTypeId` = t.`id`
WHERE e.`examTypeId` IS NULL;--> statement-breakpoint
ALTER TABLE `exam_attendance` ADD CONSTRAINT `exam_attendance_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_attendance` ADD CONSTRAINT `exam_attendance_examSubjectId_exam_subjects_id_fk` FOREIGN KEY (`examSubjectId`) REFERENCES `exam_subjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_attendance` ADD CONSTRAINT `exam_attendance_enrollmentId_student_enrollments_id_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `student_enrollments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_attendance` ADD CONSTRAINT `exam_attendance_updatedBy_user_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_types` ADD CONSTRAINT `exam_types_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_types` ADD CONSTRAINT `exam_types_createdBy_user_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `exam_attendance_school_status_idx` ON `exam_attendance` (`schoolId`,`status`);--> statement-breakpoint
CREATE INDEX `exam_types_school_created_idx` ON `exam_types` (`schoolId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `examinations` ADD CONSTRAINT `examinations_examTypeId_exam_types_id_fk` FOREIGN KEY (`examTypeId`) REFERENCES `exam_types`(`id`) ON DELETE no action ON UPDATE no action;