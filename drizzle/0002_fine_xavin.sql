CREATE TABLE `academic_terms` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`academicYearId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `academic_terms_id` PRIMARY KEY(`id`),
	CONSTRAINT `academic_terms_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `academic_terms_year_name_uq` UNIQUE(`schoolId`,`academicYearId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `academic_years` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `academic_years_id` PRIMARY KEY(`id`),
	CONSTRAINT `academic_years_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `academic_years_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `class_levels` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`code` varchar(30) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `class_levels_id` PRIMARY KEY(`id`),
	CONSTRAINT `class_levels_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `class_levels_school_code_uq` UNIQUE(`schoolId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `class_sections` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`academicYearId` bigint unsigned NOT NULL,
	`classLevelId` bigint unsigned NOT NULL,
	`name` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `class_sections_id` PRIMARY KEY(`id`),
	CONSTRAINT `class_sections_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `class_sections_year_level_name_uq` UNIQUE(`schoolId`,`academicYearId`,`classLevelId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `academic_terms` ADD CONSTRAINT `academic_terms_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `academic_terms` ADD CONSTRAINT `academic_terms_academicYearId_academic_years_id_fk` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `academic_years` ADD CONSTRAINT `academic_years_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_levels` ADD CONSTRAINT `class_levels_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_sections` ADD CONSTRAINT `class_sections_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_sections` ADD CONSTRAINT `class_sections_academicYearId_academic_years_id_fk` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_sections` ADD CONSTRAINT `class_sections_classLevelId_class_levels_id_fk` FOREIGN KEY (`classLevelId`) REFERENCES `class_levels`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `academic_terms_school_dates_idx` ON `academic_terms` (`schoolId`,`startDate`,`endDate`);--> statement-breakpoint
CREATE INDEX `academic_years_school_dates_idx` ON `academic_years` (`schoolId`,`startDate`,`endDate`);--> statement-breakpoint
CREATE INDEX `class_levels_school_name_idx` ON `class_levels` (`schoolId`,`name`);--> statement-breakpoint
CREATE INDEX `class_sections_school_year_idx` ON `class_sections` (`schoolId`,`academicYearId`);