CREATE TABLE `student_behavior_records` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`incidentDate` date NOT NULL,
	`category` varchar(40) NOT NULL,
	`severity` varchar(20) NOT NULL,
	`details` varchar(3000) NOT NULL,
	`actionTaken` varchar(40) NOT NULL,
	`followUpDate` date,
	`recordedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_behavior_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_behavior_records_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `student_behavior_records_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`),
	CONSTRAINT `student_behavior_records_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE,
	CONSTRAINT `student_behavior_records_recordedBy_user_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `user`(`id`)
);--> statement-breakpoint
CREATE INDEX `student_behavior_records_school_student_date_idx` ON `student_behavior_records` (`schoolId`,`studentId`,`incidentDate`);--> statement-breakpoint
CREATE INDEX `student_behavior_records_school_category_date_idx` ON `student_behavior_records` (`schoolId`,`category`,`incidentDate`);--> statement-breakpoint
CREATE INDEX `student_behavior_records_school_severity_date_idx` ON `student_behavior_records` (`schoolId`,`severity`,`incidentDate`);
