CREATE TABLE `account_transactions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`transactionType` varchar(20) NOT NULL,
	`categoryAccountId` bigint unsigned NOT NULL,
	`bankAccountId` bigint unsigned,
	`transactionDate` date NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`description` varchar(1000) NOT NULL,
	`payee` varchar(200),
	`reference` varchar(120),
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`submittedBy` varchar(36) NOT NULL,
	`approvedBy` varchar(36),
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `account_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_transactions_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `asset_maintenance` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`assetId` bigint unsigned NOT NULL,
	`maintenanceDate` date NOT NULL,
	`description` varchar(1000) NOT NULL,
	`cost` decimal(12,2) NOT NULL DEFAULT '0',
	`performedBy` varchar(160),
	`recordedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `asset_maintenance_id` PRIMARY KEY(`id`),
	CONSTRAINT `asset_maintenance_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `chart_of_accounts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`code` varchar(30) NOT NULL,
	`name` varchar(160) NOT NULL,
	`accountType` varchar(20) NOT NULL,
	`description` varchar(500),
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chart_of_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `chart_of_accounts_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `chart_of_accounts_school_code_uq` UNIQUE(`schoolId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `fund_transfers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`sourceBankAccountId` bigint unsigned NOT NULL,
	`destinationBankAccountId` bigint unsigned NOT NULL,
	`transferDate` date NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`reference` varchar(120),
	`note` varchar(500),
	`recordedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fund_transfers_id` PRIMARY KEY(`id`),
	CONSTRAINT `fund_transfers_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `inventory_assets` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`itemId` bigint unsigned,
	`locationId` bigint unsigned,
	`assetTag` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` varchar(1000),
	`acquiredAt` date NOT NULL,
	`acquisitionCost` decimal(12,2) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_assets_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_assets_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `inventory_assets_school_tag_uq` UNIQUE(`schoolId`,`assetTag`)
);
--> statement-breakpoint
CREATE TABLE `inventory_categories` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_categories_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `inventory_categories_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`categoryId` bigint unsigned NOT NULL,
	`supplierId` bigint unsigned,
	`locationId` bigint unsigned,
	`sku` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` varchar(1000),
	`unit` varchar(40) NOT NULL,
	`quantityOnHand` decimal(12,3) NOT NULL DEFAULT '0',
	`reorderLevel` decimal(12,3) NOT NULL DEFAULT '0',
	`averageUnitCost` decimal(12,2) NOT NULL DEFAULT '0',
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_items_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `inventory_items_school_sku_uq` UNIQUE(`schoolId`,`sku`)
);
--> statement-breakpoint
CREATE TABLE `inventory_locations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_locations_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `inventory_locations_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`itemId` bigint unsigned NOT NULL,
	`supplierId` bigint unsigned,
	`locationId` bigint unsigned,
	`movementType` varchar(20) NOT NULL,
	`quantity` decimal(12,3) NOT NULL,
	`quantityBefore` decimal(12,3) NOT NULL,
	`quantityAfter` decimal(12,3) NOT NULL,
	`unitCost` decimal(12,2) NOT NULL DEFAULT '0',
	`reference` varchar(120),
	`note` varchar(500),
	`recordedBy` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_movements_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_movements_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `inventory_suppliers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`name` varchar(160) NOT NULL,
	`contactName` varchar(160),
	`email` varchar(320),
	`phone` varchar(40),
	`address` varchar(1000),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_suppliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_suppliers_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `inventory_suppliers_school_name_uq` UNIQUE(`schoolId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `school_bank_accounts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`schoolId` bigint unsigned NOT NULL,
	`chartAccountId` bigint unsigned NOT NULL,
	`bankName` varchar(160) NOT NULL,
	`accountName` varchar(160) NOT NULL,
	`accountNumberLast4` varchar(4),
	`openingBalance` decimal(12,2) NOT NULL DEFAULT '0',
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `school_bank_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `school_bank_accounts_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `school_bank_accounts_school_name_uq` UNIQUE(`schoolId`,`accountName`)
);
--> statement-breakpoint
ALTER TABLE `account_transactions` ADD CONSTRAINT `account_transactions_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `account_transactions` ADD CONSTRAINT `account_transactions_categoryAccountId_chart_of_accounts_id_fk` FOREIGN KEY (`categoryAccountId`) REFERENCES `chart_of_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `account_transactions` ADD CONSTRAINT `account_transactions_bankAccountId_school_bank_accounts_id_fk` FOREIGN KEY (`bankAccountId`) REFERENCES `school_bank_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `account_transactions` ADD CONSTRAINT `account_transactions_submittedBy_user_id_fk` FOREIGN KEY (`submittedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `account_transactions` ADD CONSTRAINT `account_transactions_approvedBy_user_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `asset_maintenance` ADD CONSTRAINT `asset_maintenance_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `asset_maintenance` ADD CONSTRAINT `asset_maintenance_assetId_inventory_assets_id_fk` FOREIGN KEY (`assetId`) REFERENCES `inventory_assets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `asset_maintenance` ADD CONSTRAINT `asset_maintenance_recordedBy_user_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chart_of_accounts` ADD CONSTRAINT `chart_of_accounts_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fund_transfers` ADD CONSTRAINT `fund_transfers_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fund_transfers` ADD CONSTRAINT `fund_transfers_sourceBankAccountId_school_bank_accounts_id_fk` FOREIGN KEY (`sourceBankAccountId`) REFERENCES `school_bank_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fund_transfers` ADD CONSTRAINT `fund_transfers_destination_bank_fk` FOREIGN KEY (`destinationBankAccountId`) REFERENCES `school_bank_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fund_transfers` ADD CONSTRAINT `fund_transfers_recordedBy_user_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_assets` ADD CONSTRAINT `inventory_assets_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_assets` ADD CONSTRAINT `inventory_assets_itemId_inventory_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `inventory_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_assets` ADD CONSTRAINT `inventory_assets_locationId_inventory_locations_id_fk` FOREIGN KEY (`locationId`) REFERENCES `inventory_locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_categories` ADD CONSTRAINT `inventory_categories_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_categoryId_inventory_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `inventory_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_supplierId_inventory_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `inventory_suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_locationId_inventory_locations_id_fk` FOREIGN KEY (`locationId`) REFERENCES `inventory_locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_locations` ADD CONSTRAINT `inventory_locations_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_itemId_inventory_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `inventory_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_supplierId_inventory_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `inventory_suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_locationId_inventory_locations_id_fk` FOREIGN KEY (`locationId`) REFERENCES `inventory_locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_recordedBy_user_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_suppliers` ADD CONSTRAINT `inventory_suppliers_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `school_bank_accounts` ADD CONSTRAINT `school_bank_accounts_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `school_bank_accounts` ADD CONSTRAINT `school_bank_accounts_chartAccountId_chart_of_accounts_id_fk` FOREIGN KEY (`chartAccountId`) REFERENCES `chart_of_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_transactions_school_type_date_idx` ON `account_transactions` (`schoolId`,`transactionType`,`transactionDate`);--> statement-breakpoint
CREATE INDEX `account_transactions_school_status_date_idx` ON `account_transactions` (`schoolId`,`status`,`transactionDate`);--> statement-breakpoint
CREATE INDEX `account_transactions_school_bank_idx` ON `account_transactions` (`schoolId`,`bankAccountId`);--> statement-breakpoint
CREATE INDEX `asset_maintenance_school_asset_date_idx` ON `asset_maintenance` (`schoolId`,`assetId`,`maintenanceDate`);--> statement-breakpoint
CREATE INDEX `chart_of_accounts_school_type_idx` ON `chart_of_accounts` (`schoolId`,`accountType`);--> statement-breakpoint
CREATE INDEX `fund_transfers_school_date_idx` ON `fund_transfers` (`schoolId`,`transferDate`);--> statement-breakpoint
CREATE INDEX `inventory_assets_school_location_idx` ON `inventory_assets` (`schoolId`,`locationId`);--> statement-breakpoint
CREATE INDEX `inventory_categories_school_idx` ON `inventory_categories` (`schoolId`);--> statement-breakpoint
CREATE INDEX `inventory_items_school_category_idx` ON `inventory_items` (`schoolId`,`categoryId`);--> statement-breakpoint
CREATE INDEX `inventory_items_school_stock_idx` ON `inventory_items` (`schoolId`,`quantityOnHand`);--> statement-breakpoint
CREATE INDEX `inventory_locations_school_idx` ON `inventory_locations` (`schoolId`);--> statement-breakpoint
CREATE INDEX `inventory_movements_school_item_date_idx` ON `inventory_movements` (`schoolId`,`itemId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `inventory_movements_school_type_date_idx` ON `inventory_movements` (`schoolId`,`movementType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `inventory_suppliers_school_idx` ON `inventory_suppliers` (`schoolId`);--> statement-breakpoint
CREATE INDEX `school_bank_accounts_school_status_idx` ON `school_bank_accounts` (`schoolId`,`status`);--> statement-breakpoint
INSERT IGNORE INTO `permissions` (`key`, `description`) VALUES
  ('inventory.manage', 'Manage school inventory and assets'),
  ('accounts.manage', 'Manage school accounts, income, expenses, and reports');--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key` IN ('inventory.manage', 'accounts.manage')
WHERE r.`isSystem` = true
  AND r.`name` IN ('School administrator', 'Accountant');--> statement-breakpoint
INSERT INTO `chart_of_accounts` (`publicId`, `schoolId`, `code`, `name`, `accountType`, `description`, `status`)
SELECT UUID(), s.`id`, defaults.`code`, defaults.`name`, defaults.`accountType`, defaults.`description`, 'active'
FROM `schools` s
CROSS JOIN (
  SELECT '1000' AS `code`, 'Cash on hand' AS `name`, 'asset' AS `accountType`, 'Cash held by the school' AS `description`
  UNION ALL SELECT '1010', 'Bank account clearing', 'asset', 'Control account for school bank accounts'
  UNION ALL SELECT '2000', 'Accounts payable', 'liability', 'Amounts owed to suppliers and service providers'
  UNION ALL SELECT '3000', 'Accumulated school funds', 'equity', 'Opening and retained school funds'
  UNION ALL SELECT '4000', 'School fee income', 'income', 'Tuition and other student fee receipts'
  UNION ALL SELECT '4100', 'Other income', 'income', 'Donations, grants, and miscellaneous income'
  UNION ALL SELECT '5000', 'Staff expenses', 'expense', 'Salaries, allowances, and staff-related costs'
  UNION ALL SELECT '5100', 'School supplies', 'expense', 'Teaching, office, and classroom supplies'
  UNION ALL SELECT '5200', 'Utilities', 'expense', 'Electricity, water, internet, and other utilities'
  UNION ALL SELECT '5300', 'Transport costs', 'expense', 'School transport and travel costs'
  UNION ALL SELECT '5400', 'Repairs and maintenance', 'expense', 'School facility, equipment, and asset maintenance'
  UNION ALL SELECT '5500', 'Other operating expenses', 'expense', 'Other approved operating costs'
) AS defaults
WHERE NOT EXISTS (
  SELECT 1 FROM `chart_of_accounts` existing
  WHERE existing.`schoolId` = s.`id` AND existing.`code` = defaults.`code`
);