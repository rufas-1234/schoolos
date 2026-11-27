ALTER TABLE `subscription_plans` ADD `pricingModel` varchar(20) DEFAULT 'flat' NOT NULL;
--> statement-breakpoint
INSERT IGNORE INTO `subscription_plans` (`publicId`,`code`,`name`,`description`,`billingInterval`,`pricingModel`,`currency`,`amount`,`studentLimit`,`branchLimit`,`trialDays`,`includedModules`,`isTrial`,`isActive`,`sortOrder`) VALUES
('00000000-0000-4000-8000-000000006364','starter-termly-usd','Starter','Termly SchoolOS access for up to 250 students.','termly','per_student','USD','1.00',250,1,0,JSON_ARRAY('students','academics','examinations'),false,true,10),
('00000000-0000-4000-8000-000000006365','standard-termly-usd','Standard','Termly SchoolOS access for up to 500 students and 3 branches.','termly','per_student','USD','1.00',500,3,0,JSON_ARRAY('students','academics','examinations','staff','fees','accounts'),false,true,11),
('00000000-0000-4000-8000-000000006366','growth-termly-usd','Growth','Termly SchoolOS access for up to 1,000 students and 10 branches.','termly','per_student','USD','1.00',1000,10,0,JSON_ARRAY('students','academics','examinations','staff','fees','accounts','inventory','library'),false,true,12),
('00000000-0000-4000-8000-000000006367','enterprise-termly-usd','Enterprise','Termly SchoolOS access with no student or branch limit.','termly','per_student','USD','1.00',NULL,NULL,0,JSON_ARRAY('all'),false,true,13);
