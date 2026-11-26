CREATE TABLE `class_section_subject_teachers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`classSubjectId` bigint unsigned NOT NULL,
	`classSectionId` bigint unsigned NOT NULL,
	`teacherId` bigint unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `class_section_subject_teachers_id` PRIMARY KEY(`id`),
	CONSTRAINT `class_section_subject_teachers_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `csst_scope_teacher_uq` UNIQUE(`schoolId`,`classSubjectId`,`classSectionId`,`teacherId`)
);
--> statement-breakpoint
ALTER TABLE `class_section_subject_teachers` ADD CONSTRAINT `csst_school_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_section_subject_teachers` ADD CONSTRAINT `csst_class_subject_fk` FOREIGN KEY (`classSubjectId`) REFERENCES `class_subjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_section_subject_teachers` ADD CONSTRAINT `csst_class_section_fk` FOREIGN KEY (`classSectionId`) REFERENCES `class_sections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_section_subject_teachers` ADD CONSTRAINT `csst_teacher_fk` FOREIGN KEY (`teacherId`) REFERENCES `teachers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `csst_school_section_idx` ON `class_section_subject_teachers` (`schoolId`,`classSectionId`);--> statement-breakpoint
CREATE INDEX `csst_school_teacher_idx` ON `class_section_subject_teachers` (`schoolId`,`teacherId`);