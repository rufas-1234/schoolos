CREATE TABLE `exam_classes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`examinationId` bigint unsigned NOT NULL,
	`classLevelId` bigint unsigned NOT NULL,
	`classTeacherId` bigint unsigned,
	`principalRemark` varchar(1000),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exam_classes_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_classes_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `exam_classes_school_exam_class_uq` UNIQUE(`schoolId`,`examinationId`,`classLevelId`)
);
--> statement-breakpoint
CREATE TABLE `exam_grade_bands` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`gradingScaleId` bigint unsigned NOT NULL,
	`minPercent` decimal(5,2) NOT NULL,
	`maxPercent` decimal(5,2) NOT NULL,
	`grade` varchar(8) NOT NULL,
	`description` varchar(255) NOT NULL,
	`performanceRemark` varchar(255) NOT NULL,
	`sortOrder` int unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exam_grade_bands_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_grade_bands_scale_grade_uq` UNIQUE(`gradingScaleId`,`grade`)
);
--> statement-breakpoint
CREATE TABLE `exam_grading_scales` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`allowRanking` boolean NOT NULL DEFAULT false,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_grading_scales_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_grading_scales_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `exam_grading_scales_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `exam_mark_audits` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`examMarkId` bigint unsigned NOT NULL,
	`previousMarks` decimal(8,2),
	`updatedMarks` decimal(8,2),
	`action` varchar(30) NOT NULL,
	`reason` varchar(1000),
	`actorUserId` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exam_mark_audits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exam_mark_corrections` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`examMarkId` bigint unsigned NOT NULL,
	`previousMarks` decimal(8,2) NOT NULL,
	`requestedMarks` decimal(8,2) NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`requestedBy` varchar(36) NOT NULL,
	`reviewedBy` varchar(36),
	`reviewNote` varchar(1000),
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp,
	CONSTRAINT `exam_mark_corrections_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_mark_corrections_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `exam_marks` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`examSubjectId` bigint unsigned NOT NULL,
	`enrollmentId` bigint unsigned NOT NULL,
	`marks` decimal(8,2),
	`teacherRemark` varchar(1000),
	`updatedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_marks_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_marks_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `exam_marks_school_subject_enrollment_uq` UNIQUE(`schoolId`,`examSubjectId`,`enrollmentId`)
);
--> statement-breakpoint
CREATE TABLE `exam_student_remarks` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`examClassId` bigint unsigned NOT NULL,
	`enrollmentId` bigint unsigned NOT NULL,
	`classTeacherRemark` varchar(1000),
	`updatedBy` varchar(36) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_student_remarks_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_student_remarks_class_enrollment_uq` UNIQUE(`schoolId`,`examClassId`,`enrollmentId`)
);
--> statement-breakpoint
CREATE TABLE `exam_subjects` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`examClassId` bigint unsigned NOT NULL,
	`classSubjectId` bigint unsigned NOT NULL,
	`examDate` date NOT NULL,
	`maxMarks` decimal(8,2) NOT NULL DEFAULT '100',
	`weight` decimal(6,2) NOT NULL DEFAULT '1',
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`submittedBy` varchar(36),
	`submittedAt` timestamp,
	`reviewedBy` varchar(36),
	`reviewedAt` timestamp,
	`reviewNote` varchar(1000),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_subjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_subjects_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `exam_subjects_school_class_subject_uq` UNIQUE(`schoolId`,`examClassId`,`classSubjectId`)
);
--> statement-breakpoint
CREATE TABLE `examinations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`academicYearId` bigint unsigned NOT NULL,
	`academicTermId` bigint unsigned,
	`gradingScaleId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'open',
	`createdBy` varchar(36) NOT NULL,
	`publishedBy` varchar(36),
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `examinations_id` PRIMARY KEY(`id`),
	CONSTRAINT `examinations_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `examinations_school_name_year_uq` UNIQUE(`schoolId`,`academicYearId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `schools` ADD `logoUrl` varchar(2048);--> statement-breakpoint
ALTER TABLE `exam_classes` ADD CONSTRAINT `exam_classes_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_classes` ADD CONSTRAINT `exam_classes_examinationId_examinations_id_fk` FOREIGN KEY (`examinationId`) REFERENCES `examinations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_classes` ADD CONSTRAINT `exam_classes_classLevelId_class_levels_id_fk` FOREIGN KEY (`classLevelId`) REFERENCES `class_levels`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_classes` ADD CONSTRAINT `exam_classes_classTeacherId_teachers_id_fk` FOREIGN KEY (`classTeacherId`) REFERENCES `teachers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_grade_bands` ADD CONSTRAINT `exam_grade_bands_gradingScaleId_exam_grading_scales_id_fk` FOREIGN KEY (`gradingScaleId`) REFERENCES `exam_grading_scales`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_grading_scales` ADD CONSTRAINT `exam_grading_scales_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_grading_scales` ADD CONSTRAINT `exam_grading_scales_createdBy_user_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_mark_audits` ADD CONSTRAINT `exam_mark_audits_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_mark_audits` ADD CONSTRAINT `exam_mark_audits_examMarkId_exam_marks_id_fk` FOREIGN KEY (`examMarkId`) REFERENCES `exam_marks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_mark_audits` ADD CONSTRAINT `exam_mark_audits_actorUserId_user_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_mark_corrections` ADD CONSTRAINT `exam_mark_corrections_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_mark_corrections` ADD CONSTRAINT `exam_mark_corrections_examMarkId_exam_marks_id_fk` FOREIGN KEY (`examMarkId`) REFERENCES `exam_marks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_mark_corrections` ADD CONSTRAINT `exam_mark_corrections_requestedBy_user_id_fk` FOREIGN KEY (`requestedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_mark_corrections` ADD CONSTRAINT `exam_mark_corrections_reviewedBy_user_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_marks` ADD CONSTRAINT `exam_marks_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_marks` ADD CONSTRAINT `exam_marks_examSubjectId_exam_subjects_id_fk` FOREIGN KEY (`examSubjectId`) REFERENCES `exam_subjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_marks` ADD CONSTRAINT `exam_marks_enrollmentId_student_enrollments_id_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `student_enrollments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_marks` ADD CONSTRAINT `exam_marks_updatedBy_user_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_student_remarks` ADD CONSTRAINT `exam_student_remarks_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_student_remarks` ADD CONSTRAINT `exam_student_remarks_examClassId_exam_classes_id_fk` FOREIGN KEY (`examClassId`) REFERENCES `exam_classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_student_remarks` ADD CONSTRAINT `exam_student_remarks_enrollmentId_student_enrollments_id_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `student_enrollments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_student_remarks` ADD CONSTRAINT `exam_student_remarks_updatedBy_user_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_subjects` ADD CONSTRAINT `exam_subjects_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_subjects` ADD CONSTRAINT `exam_subjects_examClassId_exam_classes_id_fk` FOREIGN KEY (`examClassId`) REFERENCES `exam_classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_subjects` ADD CONSTRAINT `exam_subjects_classSubjectId_class_subjects_id_fk` FOREIGN KEY (`classSubjectId`) REFERENCES `class_subjects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_subjects` ADD CONSTRAINT `exam_subjects_submittedBy_user_id_fk` FOREIGN KEY (`submittedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_subjects` ADD CONSTRAINT `exam_subjects_reviewedBy_user_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `examinations` ADD CONSTRAINT `examinations_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `examinations` ADD CONSTRAINT `examinations_academicYearId_academic_years_id_fk` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `examinations` ADD CONSTRAINT `examinations_academicTermId_academic_terms_id_fk` FOREIGN KEY (`academicTermId`) REFERENCES `academic_terms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `examinations` ADD CONSTRAINT `examinations_gradingScaleId_exam_grading_scales_id_fk` FOREIGN KEY (`gradingScaleId`) REFERENCES `exam_grading_scales`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `examinations` ADD CONSTRAINT `examinations_createdBy_user_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `examinations` ADD CONSTRAINT `examinations_publishedBy_user_id_fk` FOREIGN KEY (`publishedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `exam_classes_school_class_idx` ON `exam_classes` (`schoolId`,`classLevelId`);--> statement-breakpoint
CREATE INDEX `exam_grade_bands_scale_range_idx` ON `exam_grade_bands` (`gradingScaleId`,`minPercent`,`maxPercent`);--> statement-breakpoint
CREATE INDEX `exam_grading_scales_school_default_idx` ON `exam_grading_scales` (`schoolId`,`isDefault`);--> statement-breakpoint
CREATE INDEX `exam_mark_audits_school_mark_created_idx` ON `exam_mark_audits` (`schoolId`,`examMarkId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `exam_mark_corrections_school_status_idx` ON `exam_mark_corrections` (`schoolId`,`status`);--> statement-breakpoint
CREATE INDEX `exam_mark_corrections_mark_idx` ON `exam_mark_corrections` (`examMarkId`,`requestedAt`);--> statement-breakpoint
CREATE INDEX `exam_marks_school_enrollment_idx` ON `exam_marks` (`schoolId`,`enrollmentId`);--> statement-breakpoint
CREATE INDEX `exam_subjects_school_status_idx` ON `exam_subjects` (`schoolId`,`status`);--> statement-breakpoint
CREATE INDEX `examinations_school_year_status_idx` ON `examinations` (`schoolId`,`academicYearId`,`status`);--> statement-breakpoint
INSERT IGNORE INTO `permissions` (`key`, `description`) VALUES
  ('examinations.create', 'Create and configure examinations'),
  ('results.enter', 'Enter examination results'),
  ('results.publish', 'Approve and publish examination results');--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key` IN ('examinations.create', 'results.publish')
WHERE r.`isSystem` = true
  AND r.`name` IN ('School administrator', 'Principal', 'Deputy principal');--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key` = 'results.enter'
WHERE r.`isSystem` = true
  AND r.`name` = 'Teacher';