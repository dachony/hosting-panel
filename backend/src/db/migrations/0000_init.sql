CREATE TABLE IF NOT EXISTS `users` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `email` text NOT NULL,
  `password_hash` text NOT NULL,
  `name` text NOT NULL,
  `role` text DEFAULT 'user' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`);

CREATE TABLE IF NOT EXISTS `clients` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `email` text,
  `phone` text,
  `address` text,
  `notes` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `domains` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `client_id` integer REFERENCES `clients`(`id`) ON DELETE CASCADE,
  `domain_name` text NOT NULL,
  `registrar` text,
  `registration_date` text,
  `expiry_date` text NOT NULL,
  `auto_renew` integer DEFAULT false,
  `notes` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `domains_domain_name_unique` ON `domains` (`domain_name`);

CREATE TABLE IF NOT EXISTS `mail_packages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `max_mailboxes` integer DEFAULT 5 NOT NULL,
  `storage_gb` real DEFAULT 5 NOT NULL,
  `price` real DEFAULT 0 NOT NULL,
  `features` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `web_hosting` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `client_id` integer REFERENCES `clients`(`id`) ON DELETE CASCADE,
  `domain_id` integer REFERENCES `domains`(`id`) ON DELETE SET NULL,
  `package_name` text NOT NULL,
  `server` text,
  `start_date` text,
  `expiry_date` text NOT NULL,
  `notes` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `mail_hosting` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `client_id` integer REFERENCES `clients`(`id`) ON DELETE CASCADE,
  `domain_id` integer REFERENCES `domains`(`id`) ON DELETE SET NULL,
  `mail_package_id` integer REFERENCES `mail_packages`(`id`) ON DELETE SET NULL,
  `start_date` text,
  `expiry_date` text NOT NULL,
  `mailboxes_count` integer DEFAULT 1 NOT NULL,
  `notes` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `notification_settings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `type` text NOT NULL,
  `days_before` text DEFAULT '[30,14,7,3,1]' NOT NULL,
  `enabled` integer DEFAULT true,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `notification_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `type` text NOT NULL,
  `reference_id` integer NOT NULL,
  `sent_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `recipient` text NOT NULL,
  `status` text NOT NULL,
  `error` text
);

CREATE TABLE IF NOT EXISTS `report_settings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `frequency` text NOT NULL,
  `recipients` text NOT NULL,
  `enabled` integer DEFAULT true,
  `last_sent` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `email_templates` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `subject` text NOT NULL,
  `html_content` text NOT NULL,
  `pdf_template` text,
  `variables` text,
  `is_active` integer DEFAULT true,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `app_settings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `key` text NOT NULL,
  `value` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `app_settings_key_unique` ON `app_settings` (`key`);
