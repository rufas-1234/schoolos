CREATE TABLE `library_books` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`isbn` varchar(20),
	`title` varchar(200) NOT NULL,
	`author` varchar(160) NOT NULL,
	`publisher` varchar(160),
	`category` varchar(100),
	`shelfLocation` varchar(80),
	`totalCopies` int unsigned NOT NULL DEFAULT 1,
	`availableCopies` int unsigned NOT NULL DEFAULT 1,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `library_books_id` PRIMARY KEY(`id`),
	CONSTRAINT `library_books_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `library_books_school_isbn_uq` UNIQUE(`schoolId`,`isbn`)
);
--> statement-breakpoint
CREATE TABLE `library_loans` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`bookId` bigint unsigned NOT NULL,
	`studentId` bigint unsigned NOT NULL,
	`issuedAt` date NOT NULL,
	`dueDate` date NOT NULL,
	`returnedAt` date,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`issuedBy` varchar(36) NOT NULL,
	`returnedBy` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `library_loans_id` PRIMARY KEY(`id`),
	CONSTRAINT `library_loans_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
ALTER TABLE `library_books` ADD CONSTRAINT `library_books_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_loans` ADD CONSTRAINT `library_loans_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_loans` ADD CONSTRAINT `library_loans_bookId_library_books_id_fk` FOREIGN KEY (`bookId`) REFERENCES `library_books`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_loans` ADD CONSTRAINT `library_loans_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_loans` ADD CONSTRAINT `library_loans_issuedBy_user_id_fk` FOREIGN KEY (`issuedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `library_loans` ADD CONSTRAINT `library_loans_returnedBy_user_id_fk` FOREIGN KEY (`returnedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `library_books_school_title_idx` ON `library_books` (`schoolId`,`title`);--> statement-breakpoint
CREATE INDEX `library_books_school_status_idx` ON `library_books` (`schoolId`,`status`);--> statement-breakpoint
CREATE INDEX `library_loans_school_status_due_idx` ON `library_loans` (`schoolId`,`status`,`dueDate`);--> statement-breakpoint
CREATE INDEX `library_loans_school_student_status_idx` ON `library_loans` (`schoolId`,`studentId`,`status`);--> statement-breakpoint
CREATE INDEX `library_loans_school_book_status_idx` ON `library_loans` (`schoolId`,`bookId`,`status`);--> statement-breakpoint
INSERT IGNORE INTO `permissions` (`key`, `description`)
VALUES ('library.manage', 'Manage library books and lending');--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key` = 'library.manage'
WHERE r.`isSystem` = true
  AND r.`name` IN ('School administrator', 'Librarian');