CREATE TABLE `staff_applications` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`applicationData` json NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`reviewedBy` varchar(36),
	`reviewedAt` timestamp,
	`staffMemberId` bigint unsigned,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_applications_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_applications_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `staff_applications_school_staff_uq` UNIQUE(`schoolId`,`staffMemberId`)
);
--> statement-breakpoint
ALTER TABLE `staff_applications` ADD CONSTRAINT `staff_applications_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_applications` ADD CONSTRAINT `staff_applications_reviewedBy_user_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_applications` ADD CONSTRAINT `staff_applications_staffMemberId_staff_members_id_fk` FOREIGN KEY (`staffMemberId`) REFERENCES `staff_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `staff_applications_school_status_created_idx` ON `staff_applications` (`schoolId`,`status`,`createdAt`);