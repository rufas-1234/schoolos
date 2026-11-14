INSERT IGNORE INTO `permissions` (`key`, `description`) VALUES
  ('fees.manage', 'Manage fee structures'),
  ('payments.record', 'Record school payments'),
  ('reports.export', 'Export school reports');
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key` IN ('fees.manage', 'payments.record', 'reports.export')
WHERE r.`isSystem` = true
  AND r.`name` IN ('School administrator', 'Accountant');