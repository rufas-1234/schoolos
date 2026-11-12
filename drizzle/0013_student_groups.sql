CREATE TABLE `student_group_memberships` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`groupId` bigint unsigned NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `student_group_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_group_memberships_group_student_uq` UNIQUE(`groupId`,`studentId`)
);
--> statement-breakpoint
CREATE TABLE `student_groups` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(1000),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_groups_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `student_groups_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `student_group_memberships` ADD CONSTRAINT `student_group_memberships_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_group_memberships` ADD CONSTRAINT `student_group_memberships_groupId_student_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `student_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_group_memberships` ADD CONSTRAINT `student_group_memberships_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_groups` ADD CONSTRAINT `student_groups_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `student_group_memberships_school_student_idx` ON `student_group_memberships` (`schoolId`,`studentId`);--> statement-breakpoint
CREATE INDEX `student_groups_school_created_idx` ON `student_groups` (`schoolId`,`createdAt`);