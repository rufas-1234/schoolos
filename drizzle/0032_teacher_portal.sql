UPDATE `roles`
SET `description` = 'Access the Teacher Portal and enter marks for assigned subjects.'
WHERE `isSystem` = true
  AND `name` = 'Teacher';
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key` = 'results.enter'
WHERE r.`isSystem` = true
  AND r.`name` = 'Teacher';
