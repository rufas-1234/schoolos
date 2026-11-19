CREATE TABLE `student_behavior_options` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`kind` varchar(20) NOT NULL,
	`name` varchar(40) NOT NULL,
	`createdBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_behavior_options_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_behavior_options_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `student_behavior_options_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`),
	CONSTRAINT `student_behavior_options_createdBy_user_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `student_behavior_options_school_kind_name_uq` ON `student_behavior_options` (`schoolId`,`kind`,`name`);--> statement-breakpoint
CREATE INDEX `student_behavior_options_school_kind_idx` ON `student_behavior_options` (`schoolId`,`kind`);
