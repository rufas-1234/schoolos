CREATE TABLE `staff_departments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_departments_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_departments_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `staff_departments_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `staff_designations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_designations_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_designations_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `staff_designations_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `staff_departments` ADD CONSTRAINT `staff_departments_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_designations` ADD CONSTRAINT `staff_designations_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `staff_departments_school_idx` ON `staff_departments` (`schoolId`);--> statement-breakpoint
CREATE INDEX `staff_designations_school_idx` ON `staff_designations` (`schoolId`);--> statement-breakpoint
INSERT IGNORE INTO `staff_departments` (`publicId`, `schoolId`, `name`)
SELECT UUID(), `schoolId`, `department` FROM `staff_members` GROUP BY `schoolId`, `department`;--> statement-breakpoint
INSERT IGNORE INTO `staff_designations` (`publicId`, `schoolId`, `name`)
SELECT UUID(), `schoolId`, `jobTitle` FROM `staff_members` GROUP BY `schoolId`, `jobTitle`;