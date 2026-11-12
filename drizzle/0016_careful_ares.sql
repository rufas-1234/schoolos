ALTER TABLE `staff_leave_balances` DROP INDEX `staff_leave_balances_school_staff_type_uq`;--> statement-breakpoint
ALTER TABLE `staff_leave_balances` ADD `leaveYear` int unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `staff_leave_requests` ADD `leaveYear` int unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `staff_leave_balances` ADD CONSTRAINT `staff_leave_balances_school_staff_type_uq` UNIQUE(`schoolId`,`staffId`,`leaveTypeId`,`leaveYear`);