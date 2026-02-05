ALTER TABLE `notification_settings` ADD COLUMN `frequency` text;
ALTER TABLE `notification_settings` ADD COLUMN `day_of_week` integer;
ALTER TABLE `notification_settings` ADD COLUMN `day_of_month` integer;
ALTER TABLE `notification_settings` ADD COLUMN `last_sent` text;
