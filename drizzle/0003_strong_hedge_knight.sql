CREATE TABLE `class_subjects` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`classLevelId` bigint unsigned NOT NULL,
	`subjectId` bigint unsigned NOT NULL,
	`isCompulsory` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `class_subjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `class_subjects_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `class_subjects_school_class_subject_uq` UNIQUE(`schoolId`,`classLevelId`,`subjectId`)
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`code` varchar(20) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `subjects_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `subjects_school_code_uq` UNIQUE(`schoolId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `class_subjects` ADD CONSTRAINT `class_subjects_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_subjects` ADD CONSTRAINT `class_subjects_classLevelId_class_levels_id_fk` FOREIGN KEY (`classLevelId`) REFERENCES `class_levels`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_subjects` ADD CONSTRAINT `class_subjects_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `class_subjects_school_class_idx` ON `class_subjects` (`schoolId`,`classLevelId`);--> statement-breakpoint
CREATE INDEX `subjects_school_name_idx` ON `subjects` (`schoolId`,`name`);