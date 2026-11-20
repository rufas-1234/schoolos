ALTER TABLE `schools` ADD `status` varchar(20) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `schools` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `schools` ADD `approvedBy` varchar(36);--> statement-breakpoint
ALTER TABLE `schools` ADD `archivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `schools` ADD `archivedBy` varchar(36);--> statement-breakpoint
ALTER TABLE `schools` ADD CONSTRAINT `schools_approvedBy_user_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schools` ADD CONSTRAINT `schools_archivedBy_user_id_fk` FOREIGN KEY (`archivedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;