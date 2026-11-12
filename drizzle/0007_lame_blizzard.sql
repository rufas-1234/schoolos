CREATE TABLE `staff_members` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`firstName` varchar(120) NOT NULL,
	`lastName` varchar(120) NOT NULL,
	`employeeCode` varchar(40),
	`jobTitle` varchar(120) NOT NULL,
	`department` varchar(120) NOT NULL,
	`email` varchar(320),
	`phone` varchar(40),
	`employmentType` varchar(20) NOT NULL DEFAULT 'full_time',
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`startDate` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_members_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `staff_members_school_code_uq` UNIQUE(`schoolId`,`employeeCode`),
	CONSTRAINT `staff_members_school_email_uq` UNIQUE(`schoolId`,`email`)
);
--> statement-breakpoint
ALTER TABLE `staff_members` ADD CONSTRAINT `staff_members_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `staff_members_school_status_name_idx` ON `staff_members` (`schoolId`,`status`,`lastName`,`firstName`);--> statement-breakpoint
CREATE INDEX `staff_members_school_department_idx` ON `staff_members` (`schoolId`,`department`);