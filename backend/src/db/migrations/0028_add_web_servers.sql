CREATE TABLE IF NOT EXISTS `web_servers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `hostname` text NOT NULL,
  `description` text,
  `is_default` integer DEFAULT false,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Add web_server_id to mail_packages if not exists
-- (SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we handle errors in migrate.ts)
ALTER TABLE `mail_packages` ADD COLUMN `web_server_id` integer;
