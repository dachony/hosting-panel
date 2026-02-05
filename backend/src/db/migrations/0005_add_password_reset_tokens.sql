-- Add password reset tokens table for self-service password reset
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `token` text NOT NULL UNIQUE,
  `expires_at` text NOT NULL,
  `used_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS `password_reset_tokens_token_idx` ON `password_reset_tokens` (`token`);
CREATE INDEX IF NOT EXISTS `password_reset_tokens_user_id_idx` ON `password_reset_tokens` (`user_id`);
