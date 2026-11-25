INSERT IGNORE INTO `permissions` (`key`, `description`)
VALUES ('staff.payroll.pay', 'Record staff payroll payments');
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key` = 'staff.payroll.pay'
WHERE r.`isSystem` = true
  AND r.`name` IN ('School administrator', 'Accountant');