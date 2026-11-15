CREATE TABLE `exam_component_marks` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`examMarkId` bigint unsigned NOT NULL,
	`examComponentId` bigint unsigned NOT NULL,
	`marks` decimal(8,2),
	`updatedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_component_marks_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_component_marks_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `exam_component_marks_mark_component_uq` UNIQUE(`schoolId`,`examMarkId`,`examComponentId`)
);
--> statement-breakpoint
CREATE TABLE `exam_components` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`examSubjectId` bigint unsigned NOT NULL,
	`title` varchar(120) NOT NULL,
	`maxMarks` decimal(8,2) NOT NULL,
	`sortOrder` int unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exam_components_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_components_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `exam_components_subject_order_uq` UNIQUE(`examSubjectId`,`sortOrder`),
	CONSTRAINT `exam_components_subject_title_uq` UNIQUE(`examSubjectId`,`title`)
);
--> statement-breakpoint
ALTER TABLE `exam_types` DROP INDEX `exam_types_school_name_uq`;--> statement-breakpoint
ALTER TABLE `exam_mark_audits` ADD `examComponentId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `exam_types` ADD `branchId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `examinations` ADD `branchId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `examinations` ADD `examSystem` varchar(10) DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE `exam_types` ADD CONSTRAINT `exam_types_school_branch_name_uq` UNIQUE(`schoolId`,`branchId`,`name`);--> statement-breakpoint
ALTER TABLE `exam_component_marks` ADD CONSTRAINT `exam_component_marks_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_component_marks` ADD CONSTRAINT `exam_component_marks_examMarkId_exam_marks_id_fk` FOREIGN KEY (`examMarkId`) REFERENCES `exam_marks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_component_marks` ADD CONSTRAINT `exam_component_marks_examComponentId_exam_components_id_fk` FOREIGN KEY (`examComponentId`) REFERENCES `exam_components`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_component_marks` ADD CONSTRAINT `exam_component_marks_updatedBy_user_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_components` ADD CONSTRAINT `exam_components_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_components` ADD CONSTRAINT `exam_components_examSubjectId_exam_subjects_id_fk` FOREIGN KEY (`examSubjectId`) REFERENCES `exam_subjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `exam_component_marks_school_component_idx` ON `exam_component_marks` (`schoolId`,`examComponentId`);--> statement-breakpoint
CREATE INDEX `exam_components_school_subject_idx` ON `exam_components` (`schoolId`,`examSubjectId`);--> statement-breakpoint
ALTER TABLE `exam_types` DROP INDEX `exam_types_school_created_idx`;--> statement-breakpoint
ALTER TABLE `exam_mark_audits` ADD CONSTRAINT `exam_mark_audits_examComponentId_exam_components_id_fk` FOREIGN KEY (`examComponentId`) REFERENCES `exam_components`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_types` ADD CONSTRAINT `exam_types_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `examinations` ADD CONSTRAINT `examinations_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `exam_types_school_branch_created_idx` ON `exam_types` (`schoolId`,`branchId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `examinations_school_branch_year_idx` ON `examinations` (`schoolId`,`branchId`,`academicYearId`);--> statement-breakpoint
INSERT INTO `exam_components` (`publicId`, `schoolId`, `examSubjectId`, `title`, `maxMarks`, `sortOrder`)
SELECT UUID(), es.`schoolId`, es.`id`, 'Exam', es.`maxMarks`, 0
FROM `exam_subjects` es;--> statement-breakpoint
INSERT INTO `exam_component_marks` (`publicId`, `schoolId`, `examMarkId`, `examComponentId`, `marks`, `updatedBy`)
SELECT UUID(), em.`schoolId`, em.`id`, ec.`id`, em.`marks`, em.`updatedBy`
FROM `exam_marks` em
INNER JOIN `exam_components` ec ON ec.`examSubjectId` = em.`examSubjectId`;