INSERT IGNORE INTO `permissions` (`key`, `description`) VALUES
  ('results.enter', 'Enter marks for assigned assessments'),
  ('results.publish', 'Approve and publish results');
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key` IN ('results.enter', 'results.publish')
WHERE r.`isSystem` = true
  AND r.`name` IN ('School administrator', 'Principal', 'Deputy principal');
