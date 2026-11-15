CREATE TABLE `student_settings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`admissionFormat` varchar(40) NOT NULL DEFAULT 'S{YY}{SEQ:4}',
	`rollFormat` varchar(40) NOT NULL DEFAULT '{SEQ:3}',
	`nextAdmissionSequence` int unsigned NOT NULL DEFAULT 1,
	`nextRollSequence` int unsigned NOT NULL DEFAULT 1,
	`fields` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_settings_school_uq` UNIQUE(`schoolId`)
);
--> statement-breakpoint
ALTER TABLE `student_settings` ADD CONSTRAINT `student_settings_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;