CREATE TABLE `students` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`firstName` varchar(120) NOT NULL,
	`lastName` varchar(120) NOT NULL,
	`email` varchar(320),
	`phone` varchar(40),
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `students_id` PRIMARY KEY(`id`),
	CONSTRAINT `students_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `students_school_status_idx` ON `students` (`schoolId`,`status`);--> statement-breakpoint
CREATE INDEX `students_school_created_idx` ON `students` (`schoolId`,`createdAt`);