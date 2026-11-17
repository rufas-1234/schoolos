ALTER TABLE `library_loans` MODIFY COLUMN `studentId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `library_members` MODIFY COLUMN `studentId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `library_members` ADD `memberType` varchar(20) DEFAULT 'student' NOT NULL;--> statement-breakpoint
ALTER TABLE `library_members` ADD `staffMemberId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `library_members` ADD CONSTRAINT `library_members_school_staff_uq` UNIQUE(`schoolId`,`staffMemberId`);--> statement-breakpoint
ALTER TABLE `library_members` ADD CONSTRAINT `library_members_staffMemberId_staff_members_id_fk` FOREIGN KEY (`staffMemberId`) REFERENCES `staff_members`(`id`) ON DELETE no action ON UPDATE no action;