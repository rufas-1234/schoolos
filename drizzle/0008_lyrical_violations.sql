CREATE TABLE `class_rooms` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned NOT NULL,
	`roomNumber` varchar(80) NOT NULL,
	`capacity` int unsigned NOT NULL,
	`location` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `class_rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `class_rooms_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `class_rooms_branch_room_uq` UNIQUE(`schoolId`,`branchId`,`roomNumber`)
);
--> statement-breakpoint
CREATE TABLE `class_routines` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`classSectionId` bigint unsigned NOT NULL,
	`classSubjectId` bigint unsigned NOT NULL,
	`classRoomId` bigint unsigned,
	`dayOfWeek` int unsigned NOT NULL,
	`startsAt` varchar(5) NOT NULL,
	`endsAt` varchar(5) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `class_routines_id` PRIMARY KEY(`id`),
	CONSTRAINT `class_routines_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `school_branches` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`code` varchar(30) NOT NULL,
	`contactNumber` varchar(40),
	`email` varchar(320),
	`address` varchar(1000),
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `school_branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `school_branches_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `school_branches_school_code_uq` UNIQUE(`schoolId`,`code`),
	CONSTRAINT `school_branches_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `class_levels` DROP INDEX `class_levels_school_code_uq`;--> statement-breakpoint
ALTER TABLE `subjects` DROP INDEX `subjects_school_code_uq`;--> statement-breakpoint
ALTER TABLE `class_levels` ADD `branchId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `subjects` ADD `branchId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `subjects` ADD `subjectType` varchar(20) DEFAULT 'theory' NOT NULL;--> statement-breakpoint
ALTER TABLE `teachers` ADD `branchId` bigint unsigned;--> statement-breakpoint
INSERT INTO `school_branches` (`publicId`, `schoolId`, `name`, `code`)
SELECT UUID(), `id`, 'Main campus', 'MAIN' FROM `schools`;--> statement-breakpoint
UPDATE `class_levels` AS c
INNER JOIN `school_branches` AS b ON b.`schoolId` = c.`schoolId` AND b.`code` = 'MAIN'
SET c.`branchId` = b.`id` WHERE c.`branchId` IS NULL;--> statement-breakpoint
UPDATE `subjects` AS s
INNER JOIN `school_branches` AS b ON b.`schoolId` = s.`schoolId` AND b.`code` = 'MAIN'
SET s.`branchId` = b.`id` WHERE s.`branchId` IS NULL;--> statement-breakpoint
UPDATE `teachers` AS t
INNER JOIN `school_branches` AS b ON b.`schoolId` = t.`schoolId` AND b.`code` = 'MAIN'
SET t.`branchId` = b.`id` WHERE t.`branchId` IS NULL;--> statement-breakpoint
ALTER TABLE `class_levels` MODIFY `branchId` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `subjects` MODIFY `branchId` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `teachers` MODIFY `branchId` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `class_levels` ADD CONSTRAINT `class_levels_branch_code_uq` UNIQUE(`schoolId`,`branchId`,`code`);--> statement-breakpoint
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_branch_code_uq` UNIQUE(`schoolId`,`branchId`,`code`);--> statement-breakpoint
ALTER TABLE `class_rooms` ADD CONSTRAINT `class_rooms_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_rooms` ADD CONSTRAINT `class_rooms_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_routines` ADD CONSTRAINT `class_routines_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_routines` ADD CONSTRAINT `class_routines_classSectionId_class_sections_id_fk` FOREIGN KEY (`classSectionId`) REFERENCES `class_sections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_routines` ADD CONSTRAINT `class_routines_classSubjectId_class_subjects_id_fk` FOREIGN KEY (`classSubjectId`) REFERENCES `class_subjects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_routines` ADD CONSTRAINT `class_routines_classRoomId_class_rooms_id_fk` FOREIGN KEY (`classRoomId`) REFERENCES `class_rooms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `school_branches` ADD CONSTRAINT `school_branches_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `class_rooms_school_branch_idx` ON `class_rooms` (`schoolId`,`branchId`);--> statement-breakpoint
CREATE INDEX `class_routines_school_section_day_idx` ON `class_routines` (`schoolId`,`classSectionId`,`dayOfWeek`);--> statement-breakpoint
CREATE INDEX `class_routines_school_room_day_idx` ON `class_routines` (`schoolId`,`classRoomId`,`dayOfWeek`);--> statement-breakpoint
CREATE INDEX `school_branches_school_status_idx` ON `school_branches` (`schoolId`,`status`);--> statement-breakpoint
ALTER TABLE `class_levels` ADD CONSTRAINT `class_levels_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teachers` ADD CONSTRAINT `teachers_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;