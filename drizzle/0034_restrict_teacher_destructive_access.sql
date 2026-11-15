DELETE rp
FROM `role_permissions` rp
JOIN `roles` r ON r.`id` = rp.`roleId`
JOIN `permissions` p ON p.`id` = rp.`permissionId`
WHERE r.`isSystem` = true
  AND r.`name` = 'Teacher'
  AND p.`key` IN ('academics.delete', 'students.delete', 'examinations.delete', 'results.publish');
