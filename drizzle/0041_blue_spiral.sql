CREATE TABLE `user_login_identifiers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`userId` varchar(36) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`identifier` varchar(320) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_login_identifiers_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_login_identifiers_school_identifier_uq` UNIQUE(`schoolId`,`identifier`)
);
--> statement-breakpoint
CREATE TABLE `user_student_links` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`userId` varchar(36) NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`accessType` varchar(20) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_student_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_student_links_user_student_type_uq` UNIQUE(`userId`,`studentId`,`accessType`)
);
--> statement-breakpoint
ALTER TABLE `user_login_identifiers` ADD CONSTRAINT `user_login_identifiers_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_login_identifiers` ADD CONSTRAINT `user_login_identifiers_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_student_links` ADD CONSTRAINT `user_student_links_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_student_links` ADD CONSTRAINT `user_student_links_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_student_links` ADD CONSTRAINT `user_student_links_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `user_login_identifiers_user_idx` ON `user_login_identifiers` (`userId`,`schoolId`);--> statement-breakpoint
CREATE INDEX `user_student_links_school_user_type_idx` ON `user_student_links` (`schoolId`,`userId`,`accessType`);--> statement-breakpoint
INSERT IGNORE INTO `user_login_identifiers` (`schoolId`, `userId`, `kind`, `identifier`)
SELECT candidates.`schoolId`, MIN(candidates.`userId`), 'staff_phone', candidates.`identifier`
FROM (
	SELECT
		sm.`schoolId`,
		sm.`linkedUserId` AS `userId`,
		REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(sm.`phone`, ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '/', ''), CHAR(9), '') AS `identifier`
	FROM `staff_members` sm
	INNER JOIN `school_memberships` membership
		ON membership.`schoolId` = sm.`schoolId`
		AND membership.`userId` = sm.`linkedUserId`
		AND membership.`status` = 'active'
	INNER JOIN `user` u ON u.`id` = sm.`linkedUserId` AND u.`isActive` = true
	WHERE sm.`linkedUserId` IS NOT NULL
		AND sm.`status` = 'active'
		AND sm.`phone` IS NOT NULL
) candidates
WHERE candidates.`identifier` REGEXP '^[+]?[0-9]{7,15}$'
GROUP BY candidates.`schoolId`, candidates.`identifier`
HAVING COUNT(DISTINCT candidates.`userId`) = 1;--> statement-breakpoint
INSERT IGNORE INTO `user_login_identifiers` (`schoolId`, `userId`, `kind`, `identifier`)
SELECT candidates.`schoolId`, MIN(candidates.`userId`), 'parent_phone', candidates.`identifier`
FROM (
	SELECT
		s.`schoolId`,
		u.`id` AS `userId`,
		REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(s.`guardianPhone`, ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '/', ''), CHAR(9), '') AS `identifier`
	FROM `students` s
	INNER JOIN `user` u ON LOWER(u.`email`) = LOWER(s.`guardianEmail`) AND u.`isActive` = true
	INNER JOIN `school_memberships` membership
		ON membership.`schoolId` = s.`schoolId`
		AND membership.`userId` = u.`id`
		AND membership.`status` = 'active'
	WHERE s.`status` IN ('admitted', 'active')
		AND s.`guardianEmail` IS NOT NULL
		AND s.`guardianPhone` IS NOT NULL
) candidates
WHERE candidates.`identifier` REGEXP '^[+]?[0-9]{7,15}$'
GROUP BY candidates.`schoolId`, candidates.`identifier`
HAVING COUNT(DISTINCT candidates.`userId`) = 1;