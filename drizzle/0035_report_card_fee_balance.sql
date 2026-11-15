INSERT IGNORE INTO `permissions` (`key`, `description`)
VALUES ('fees.balance.view', 'View outstanding student fee balances');
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `role_permissions` existing_rp ON existing_rp.`roleId` = r.`id`
JOIN `permissions` existing_p ON existing_p.`id` = existing_rp.`permissionId`
JOIN `permissions` p ON p.`key` = 'fees.balance.view'
WHERE existing_p.`key` IN ('fees.manage', 'payments.record')
   OR r.`isSystem` = true AND r.`name` = 'Teacher';
