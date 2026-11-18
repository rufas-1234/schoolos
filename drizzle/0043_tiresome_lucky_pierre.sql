CREATE TABLE `dormitories` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned,
	`name` varchar(120) NOT NULL,
	`genderPolicy` varchar(20) NOT NULL DEFAULT 'mixed',
	`description` varchar(1000),
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dormitories_id` PRIMARY KEY(`id`),
	CONSTRAINT `dormitories_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `dormitories_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `dormitory_rooms` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`dormitoryId` bigint unsigned NOT NULL,
	`roomNumber` varchar(40) NOT NULL,
	`capacity` int unsigned NOT NULL DEFAULT 1,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dormitory_rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `dormitory_rooms_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `dormitory_rooms_dorm_room_uq` UNIQUE(`dormitoryId`,`roomNumber`)
);
--> statement-breakpoint
CREATE TABLE `student_dormitory_assignments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`roomId` bigint unsigned NOT NULL,
	`assignedAt` date NOT NULL,
	`leftAt` date,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`assignedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_dormitory_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_dormitory_assignments_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
ALTER TABLE `dormitories` ADD CONSTRAINT `dormitories_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dormitories` ADD CONSTRAINT `dormitories_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dormitory_rooms` ADD CONSTRAINT `dormitory_rooms_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dormitory_rooms` ADD CONSTRAINT `dormitory_rooms_dormitoryId_dormitories_id_fk` FOREIGN KEY (`dormitoryId`) REFERENCES `dormitories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_dormitory_assignments` ADD CONSTRAINT `student_dormitory_assignments_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_dormitory_assignments` ADD CONSTRAINT `student_dormitory_assignments_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_dormitory_assignments` ADD CONSTRAINT `student_dormitory_assignments_roomId_dormitory_rooms_id_fk` FOREIGN KEY (`roomId`) REFERENCES `dormitory_rooms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_dormitory_assignments` ADD CONSTRAINT `student_dormitory_assignments_assignedBy_user_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `dormitories_school_branch_status_idx` ON `dormitories` (`schoolId`,`branchId`,`status`);--> statement-breakpoint
CREATE INDEX `dormitory_rooms_school_dorm_status_idx` ON `dormitory_rooms` (`schoolId`,`dormitoryId`,`status`);--> statement-breakpoint
CREATE INDEX `student_dormitory_assignments_school_student_status_idx` ON `student_dormitory_assignments` (`schoolId`,`studentId`,`status`);--> statement-breakpoint
CREATE INDEX `student_dormitory_assignments_school_room_status_idx` ON `student_dormitory_assignments` (`schoolId`,`roomId`,`status`);--> statement-breakpoint
INSERT IGNORE INTO `permissions` (`key`, `description`)
VALUES ('dormitories.manage', 'Manage dormitories, rooms, and student assignments');--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key` = 'dormitories.manage'
WHERE r.`isSystem` = true
  AND r.`name` IN ('School administrator', 'Hostel administrator');