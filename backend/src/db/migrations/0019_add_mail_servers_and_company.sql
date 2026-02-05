CREATE TABLE IF NOT EXISTS `mail_servers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `hostname` text NOT NULL,
  `description` text,
  `is_default` integer DEFAULT false,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `mail_security` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `hostname` text NOT NULL,
  `description` text,
  `is_default` integer DEFAULT false,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `company_info` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `logo` text,
  `address` text,
  `city` text,
  `postal_code` text,
  `country` text,
  `website` text,
  `email` text,
  `phone` text,
  `phone2` text,
  `contact_name` text,
  `contact_phone` text,
  `contact_email` text,
  `tech_contact_name` text,
  `tech_contact_phone` text,
  `tech_contact_email` text,
  `pib` text,
  `mib` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `bank_accounts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `bank_name` text NOT NULL,
  `account_number` text NOT NULL,
  `swift` text,
  `iban` text,
  `is_default` integer DEFAULT false,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Add mail_server_id and mail_security_id to mail_packages if not exists
-- (SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we handle errors in migrate.ts)
ALTER TABLE `mail_packages` ADD COLUMN `mail_server_id` integer;
ALTER TABLE `mail_packages` ADD COLUMN `mail_security_id` integer;

-- Add mail_server_id to web_hosting if not exists
ALTER TABLE `web_hosting` ADD COLUMN `mail_server_id` integer;

-- Add is_active to mail_hosting if not exists
ALTER TABLE `mail_hosting` ADD COLUMN `is_active` integer DEFAULT true NOT NULL;
