-- Add audit logs table for tracking all user actions
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer REFERENCES `users`(`id`) ON DELETE SET NULL,
  `user_name` text NOT NULL,
  `user_email` text NOT NULL,
  `action` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` integer,
  `entity_name` text,
  `details` text,
  `ip_address` text,
  `user_agent` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS `audit_logs_user_id_idx` ON `audit_logs` (`user_id`);
CREATE INDEX IF NOT EXISTS `audit_logs_entity_type_idx` ON `audit_logs` (`entity_type`);
CREATE INDEX IF NOT EXISTS `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);
