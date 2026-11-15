INSERT IGNORE INTO `permissions` (`key`, `description`) VALUES
  ('academics.manage', 'Manage academic setup, attendance, and enrollment without deleting records'),
  ('academics.delete', 'Delete academic setup and records'),
  ('examinations.delete', 'Delete examinations');
--> statement-breakpoint
UPDATE `permissions` SET `description` = 'View student records'
WHERE `key` = 'students.view';
--> statement-breakpoint
UPDATE `permissions` SET `description` = 'Add student records'
WHERE `key` = 'students.create';
--> statement-breakpoint
UPDATE `permissions` SET `description` = 'Edit student records, enrollment, and attendance'
WHERE `key` = 'students.update';
--> statement-breakpoint
UPDATE `permissions` SET `description` = 'Configure examinations and assessments'
WHERE `key` = 'examinations.create';
--> statement-breakpoint
UPDATE `permissions` SET `description` = 'Enter marks for assigned assessments'
WHERE `key` = 'results.enter';
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key` IN ('academics.manage', 'students.view', 'students.create', 'students.update', 'examinations.create', 'results.enter')
WHERE r.`isSystem` = true
  AND r.`name` = 'Teacher';
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `role_permissions` existing_rp ON existing_rp.`roleId` = r.`id`
JOIN `permissions` existing_p ON existing_p.`id` = existing_rp.`permissionId`
JOIN `permissions` p ON p.`key` = 'academics.manage'
WHERE existing_p.`key` = 'school.settings.manage';
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `role_permissions` existing_rp ON existing_rp.`roleId` = r.`id`
JOIN `permissions` existing_p ON existing_p.`id` = existing_rp.`permissionId`
JOIN `permissions` p ON p.`key` = 'academics.delete'
WHERE existing_p.`key` = 'school.settings.manage';
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `role_permissions` existing_rp ON existing_rp.`roleId` = r.`id`
JOIN `permissions` existing_p ON existing_p.`id` = existing_rp.`permissionId`
JOIN `permissions` p ON p.`key` = 'examinations.delete'
WHERE existing_p.`key` = 'examinations.create';
--> statement-breakpoint
UPDATE `roles`
SET `description` = 'Manage academic setup, student records, and examinations; no delete or result-publishing access.'
WHERE `isSystem` = true
  AND `name` = 'Teacher';
