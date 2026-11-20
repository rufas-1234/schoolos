CREATE TABLE `exam_teacher_signatures` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`teacherId` bigint unsigned NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`fileName` varchar(160) NOT NULL,
	`contentType` varchar(100) NOT NULL,
	`uploadedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exam_teacher_signatures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `exam_teacher_signatures` ADD CONSTRAINT `exam_teacher_signatures_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_teacher_signatures` ADD CONSTRAINT `exam_teacher_signatures_teacherId_teachers_id_fk` FOREIGN KEY (`teacherId`) REFERENCES `teachers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_teacher_signatures` ADD CONSTRAINT `exam_teacher_signatures_uploadedBy_user_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `exam_teacher_signatures_school_teacher_created_idx` ON `exam_teacher_signatures` (`schoolId`,`teacherId`,`createdAt`);