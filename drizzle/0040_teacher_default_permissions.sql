DELETE rp
FROM `role_permissions` rp
JOIN `roles` r ON r.`id` = rp.`roleId`
JOIN `permissions` p ON p.`id` = rp.`permissionId`
WHERE r.`isSystem` = true
  AND r.`name` = 'Teacher'
  AND p.`key` IN (
    'academics.manage',
    'students.view',
    'students.create',
    'students.update',
    'examinations.create',
    'fees.balance.view'
  );
--> statement-breakpoint
UPDATE `roles`
SET `description` = 'Access the teacher portal, enter marks for assigned subjects, and record attendance for appointed classes.'
WHERE `isSystem` = true
  AND `name` = 'Teacher';
