CREATE TABLE `staff_attendance` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`staffId` bigint unsigned NOT NULL,
	`attendanceDate` date NOT NULL,
	`status` varchar(20) NOT NULL,
	`note` varchar(500),
	`recordedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_attendance_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `staff_attendance_school_staff_date_uq` UNIQUE(`schoolId`,`staffId`,`attendanceDate`)
);
--> statement-breakpoint
CREATE TABLE `staff_leave_balances` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`staffId` bigint unsigned NOT NULL,
	`leaveTypeId` bigint unsigned NOT NULL,
	`entitlementDays` decimal(6,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_leave_balances_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_leave_balances_school_staff_type_uq` UNIQUE(`schoolId`,`staffId`,`leaveTypeId`)
);
--> statement-breakpoint
CREATE TABLE `staff_leave_requests` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`staffId` bigint unsigned NOT NULL,
	`leaveTypeId` bigint unsigned NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`requestedDays` int unsigned NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`reviewNote` varchar(500),
	`reviewedBy` varchar(36),
	`reviewedAt` timestamp,
	`createdBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_leave_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_leave_requests_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `staff_leave_types` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_leave_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_leave_types_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `staff_leave_types_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `staff_payroll_records` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`staffId` bigint unsigned NOT NULL,
	`payPeriod` varchar(7) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`paidDate` date,
	`status` varchar(20) NOT NULL DEFAULT 'recorded',
	`notes` varchar(1000),
	`recordedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_payroll_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_payroll_records_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `staff_payroll_school_staff_period_uq` UNIQUE(`schoolId`,`staffId`,`payPeriod`)
);
--> statement-breakpoint
ALTER TABLE `staff_members` ADD `dateOfBirth` date;--> statement-breakpoint
ALTER TABLE `staff_members` ADD `address` varchar(1000);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `emergencyContactName` varchar(160);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `emergencyContactPhone` varchar(40);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `linkedUserId` varchar(36);--> statement-breakpoint
ALTER TABLE `staff_members` ADD CONSTRAINT `staff_members_school_user_uq` UNIQUE(`schoolId`,`linkedUserId`);--> statement-breakpoint
ALTER TABLE `staff_attendance` ADD CONSTRAINT `staff_attendance_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_attendance` ADD CONSTRAINT `staff_attendance_staffId_staff_members_id_fk` FOREIGN KEY (`staffId`) REFERENCES `staff_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_attendance` ADD CONSTRAINT `staff_attendance_recordedBy_user_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_leave_balances` ADD CONSTRAINT `staff_leave_balances_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_leave_balances` ADD CONSTRAINT `staff_leave_balances_staffId_staff_members_id_fk` FOREIGN KEY (`staffId`) REFERENCES `staff_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_leave_balances` ADD CONSTRAINT `staff_leave_balances_leaveTypeId_staff_leave_types_id_fk` FOREIGN KEY (`leaveTypeId`) REFERENCES `staff_leave_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_leave_requests` ADD CONSTRAINT `staff_leave_requests_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_leave_requests` ADD CONSTRAINT `staff_leave_requests_staffId_staff_members_id_fk` FOREIGN KEY (`staffId`) REFERENCES `staff_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_leave_requests` ADD CONSTRAINT `staff_leave_requests_leaveTypeId_staff_leave_types_id_fk` FOREIGN KEY (`leaveTypeId`) REFERENCES `staff_leave_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_leave_requests` ADD CONSTRAINT `staff_leave_requests_reviewedBy_user_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_leave_requests` ADD CONSTRAINT `staff_leave_requests_createdBy_user_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_leave_types` ADD CONSTRAINT `staff_leave_types_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_payroll_records` ADD CONSTRAINT `staff_payroll_records_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_payroll_records` ADD CONSTRAINT `staff_payroll_records_staffId_staff_members_id_fk` FOREIGN KEY (`staffId`) REFERENCES `staff_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_payroll_records` ADD CONSTRAINT `staff_payroll_records_recordedBy_user_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `staff_attendance_school_date_status_idx` ON `staff_attendance` (`schoolId`,`attendanceDate`,`status`);--> statement-breakpoint
CREATE INDEX `staff_leave_balances_school_type_idx` ON `staff_leave_balances` (`schoolId`,`leaveTypeId`);--> statement-breakpoint
CREATE INDEX `staff_leave_requests_school_status_dates_idx` ON `staff_leave_requests` (`schoolId`,`status`,`startDate`,`endDate`);--> statement-breakpoint
CREATE INDEX `staff_leave_requests_school_staff_idx` ON `staff_leave_requests` (`schoolId`,`staffId`);--> statement-breakpoint
CREATE INDEX `staff_leave_types_school_idx` ON `staff_leave_types` (`schoolId`);--> statement-breakpoint
CREATE INDEX `staff_payroll_school_period_status_idx` ON `staff_payroll_records` (`schoolId`,`payPeriod`,`status`);--> statement-breakpoint
ALTER TABLE `staff_members` ADD CONSTRAINT `staff_members_linkedUserId_user_id_fk` FOREIGN KEY (`linkedUserId`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;