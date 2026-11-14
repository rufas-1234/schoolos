ALTER TABLE `teachers` ADD `staffMemberId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `teachers` ADD CONSTRAINT `teachers_staff_member_uq` UNIQUE(`staffMemberId`);--> statement-breakpoint
ALTER TABLE `teachers` ADD CONSTRAINT `teachers_staffMemberId_staff_members_id_fk` FOREIGN KEY (`staffMemberId`) REFERENCES `staff_members`(`id`) ON DELETE set null ON UPDATE no action;