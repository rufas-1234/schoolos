ALTER TABLE `schools` ADD `isPracticeWorkspace` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `schools` ADD `practiceParentSchoolId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `schools` ADD CONSTRAINT `schools_practice_parent_fk` FOREIGN KEY (`practiceParentSchoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `schools_practice_parent_idx` ON `schools` (`practiceParentSchoolId`);