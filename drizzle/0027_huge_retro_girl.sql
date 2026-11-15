CREATE TABLE `staff_settings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`requiredFields` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_settings_school_uq` UNIQUE(`schoolId`)
);
--> statement-breakpoint
ALTER TABLE `staff_settings` ADD CONSTRAINT `staff_settings_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;