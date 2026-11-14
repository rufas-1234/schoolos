ALTER TABLE `staff_payroll_records` ADD `baseSalary` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `staff_payroll_records` ADD `allowances` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `staff_payroll_records` ADD `deductions` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
UPDATE `staff_payroll_records` SET `baseSalary` = `amount` WHERE `amount` > 0;--> statement-breakpoint
