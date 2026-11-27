CREATE TABLE `staff_certificates` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`staffId` bigint unsigned NOT NULL,
	`certificateNumber` varchar(48) NOT NULL,
	`category` varchar(120) NOT NULL,
	`title` varchar(160) NOT NULL,
	`achievement` varchar(2000) NOT NULL,
	`issuedAt` date NOT NULL,
	`issuedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_certificates_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_certificates_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `staff_certificates_school_number_uq` UNIQUE(`schoolId`,`certificateNumber`)
);
--> statement-breakpoint
CREATE TABLE `transport_assignments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`enrollmentId` bigint unsigned NOT NULL,
	`feeMasterId` bigint unsigned NOT NULL,
	`routeId` bigint unsigned NOT NULL,
	`pickupPointId` bigint unsigned NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`assignedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transport_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `transport_assignments_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `transport_assignment_student_fee_uq` UNIQUE(`schoolId`,`studentId`,`feeMasterId`)
);
--> statement-breakpoint
CREATE TABLE `transport_drivers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`staffId` bigint unsigned,
	`name` varchar(160) NOT NULL,
	`phone` varchar(40) NOT NULL,
	`licenseNumber` varchar(80) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transport_drivers_id` PRIMARY KEY(`id`),
	CONSTRAINT `transport_drivers_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `transport_drivers_school_license_uq` UNIQUE(`schoolId`,`licenseNumber`)
);
--> statement-breakpoint
CREATE TABLE `transport_fee_masters` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`academicYearId` bigint unsigned NOT NULL,
	`academicTermId` bigint unsigned NOT NULL,
	`routeId` bigint unsigned NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transport_fee_masters_id` PRIMARY KEY(`id`),
	CONSTRAINT `transport_fee_masters_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `transport_fee_route_term_uq` UNIQUE(`schoolId`,`routeId`,`academicTermId`)
);
--> statement-breakpoint
CREATE TABLE `transport_pickup_points` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`routeId` bigint unsigned NOT NULL,
	`name` varchar(160) NOT NULL,
	`sequence` int unsigned NOT NULL DEFAULT 1,
	`pickupTime` varchar(8),
	`dropoffTime` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transport_pickup_points_id` PRIMARY KEY(`id`),
	CONSTRAINT `transport_pickup_points_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `transport_pickup_route_name_uq` UNIQUE(`routeId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `transport_routes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned,
	`driverId` bigint unsigned,
	`name` varchar(120) NOT NULL,
	`code` varchar(40) NOT NULL,
	`description` varchar(500),
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transport_routes_id` PRIMARY KEY(`id`),
	CONSTRAINT `transport_routes_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `transport_routes_school_code_uq` UNIQUE(`schoolId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `staff_certificates` ADD CONSTRAINT `staff_certificates_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_certificates` ADD CONSTRAINT `staff_certificates_staffId_staff_members_id_fk` FOREIGN KEY (`staffId`) REFERENCES `staff_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_certificates` ADD CONSTRAINT `staff_certificates_issuedBy_user_id_fk` FOREIGN KEY (`issuedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_assignments` ADD CONSTRAINT `transport_assignments_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_assignments` ADD CONSTRAINT `transport_assignments_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_assignments` ADD CONSTRAINT `transport_assignments_enrollmentId_student_enrollments_id_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `student_enrollments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_assignments` ADD CONSTRAINT `transport_assignments_feeMasterId_transport_fee_masters_id_fk` FOREIGN KEY (`feeMasterId`) REFERENCES `transport_fee_masters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_assignments` ADD CONSTRAINT `transport_assignments_routeId_transport_routes_id_fk` FOREIGN KEY (`routeId`) REFERENCES `transport_routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_assignments` ADD CONSTRAINT `transport_assign_pickup_point_fk` FOREIGN KEY (`pickupPointId`) REFERENCES `transport_pickup_points`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_assignments` ADD CONSTRAINT `transport_assignments_assignedBy_user_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_drivers` ADD CONSTRAINT `transport_drivers_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_drivers` ADD CONSTRAINT `transport_drivers_staffId_staff_members_id_fk` FOREIGN KEY (`staffId`) REFERENCES `staff_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_fee_masters` ADD CONSTRAINT `transport_fee_masters_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_fee_masters` ADD CONSTRAINT `transport_fee_masters_academicYearId_academic_years_id_fk` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_fee_masters` ADD CONSTRAINT `transport_fee_masters_academicTermId_academic_terms_id_fk` FOREIGN KEY (`academicTermId`) REFERENCES `academic_terms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_fee_masters` ADD CONSTRAINT `transport_fee_masters_routeId_transport_routes_id_fk` FOREIGN KEY (`routeId`) REFERENCES `transport_routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_pickup_points` ADD CONSTRAINT `transport_pickup_points_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_pickup_points` ADD CONSTRAINT `transport_pickup_points_routeId_transport_routes_id_fk` FOREIGN KEY (`routeId`) REFERENCES `transport_routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_routes` ADD CONSTRAINT `transport_routes_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_routes` ADD CONSTRAINT `transport_routes_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transport_routes` ADD CONSTRAINT `transport_routes_driverId_transport_drivers_id_fk` FOREIGN KEY (`driverId`) REFERENCES `transport_drivers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `staff_certificates_school_staff_issued_idx` ON `staff_certificates` (`schoolId`,`staffId`,`issuedAt`);--> statement-breakpoint
CREATE INDEX `staff_certificates_school_category_idx` ON `staff_certificates` (`schoolId`,`category`);--> statement-breakpoint
CREATE INDEX `transport_assignment_school_status_idx` ON `transport_assignments` (`schoolId`,`status`);--> statement-breakpoint
CREATE INDEX `transport_assignment_school_route_idx` ON `transport_assignments` (`schoolId`,`routeId`);--> statement-breakpoint
CREATE INDEX `transport_drivers_school_status_idx` ON `transport_drivers` (`schoolId`,`status`);--> statement-breakpoint
CREATE INDEX `transport_fee_school_year_term_idx` ON `transport_fee_masters` (`schoolId`,`academicYearId`,`academicTermId`);--> statement-breakpoint
CREATE INDEX `transport_pickup_school_route_sequence_idx` ON `transport_pickup_points` (`schoolId`,`routeId`,`sequence`);--> statement-breakpoint
CREATE INDEX `transport_routes_school_branch_idx` ON `transport_routes` (`schoolId`,`branchId`);--> statement-breakpoint
CREATE INDEX `transport_routes_school_status_idx` ON `transport_routes` (`schoolId`,`status`);--> statement-breakpoint
INSERT IGNORE INTO `permissions` (`key`, `description`) VALUES ('transport.manage', 'Manage school transport routes, drivers, assignments, and fees');--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT `roles`.`id`, `permissions`.`id`
FROM `roles` INNER JOIN `permissions` ON `permissions`.`key` = 'transport.manage'
WHERE `roles`.`name` IN ('School administrator', 'Transport manager');
