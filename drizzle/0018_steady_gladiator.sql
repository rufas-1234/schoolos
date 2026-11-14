ALTER TABLE `staff_members` ADD `branchId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `staff_members` ADD `personnelRole` varchar(40);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `fatherName` varchar(160);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `motherName` varchar(160);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `gender` varchar(20);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `maritalStatus` varchar(20);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `permanentAddress` varchar(1000);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `drivingLicense` varchar(80);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `showAsExpert` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `staff_members` ADD `qualification` varchar(2000);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `experience` varchar(2000);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `epfNumber` varchar(80);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `basicSalary` decimal(12,2);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `contractType` varchar(20);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `location` varchar(255);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `bankAccountName` varchar(160);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `bankAccountNumber` varchar(80);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `bankName` varchar(160);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `bankBranch` varchar(160);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `facebookUrl` varchar(2048);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `twitterUrl` varchar(2048);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `linkedinUrl` varchar(2048);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `instagramUrl` varchar(2048);--> statement-breakpoint
ALTER TABLE `staff_members` ADD `documents` json;--> statement-breakpoint
ALTER TABLE `staff_members` ADD `customFields` json;--> statement-breakpoint
ALTER TABLE `staff_members` ADD CONSTRAINT `staff_members_branchId_school_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE no action ON UPDATE no action;