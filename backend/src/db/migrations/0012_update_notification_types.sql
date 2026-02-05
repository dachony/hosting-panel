-- Update notification_settings types and rename days_before to schedule
-- Map old types to new types (safe to run multiple times)
UPDATE notification_settings SET type = 'client' WHERE type IN ('domain', 'hosting', 'mail');

-- Clean up any leftover temporary table from previous failed migration
DROP TABLE IF EXISTS notification_settings_new;

-- Rename column days_before to schedule (SQLite doesn't support rename, so we recreate)
-- This will fail with "no such column: days_before" if already migrated - that's handled in migrate.ts
CREATE TABLE notification_settings_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  schedule TEXT NOT NULL DEFAULT '[30, 14, 7, 1, 0]',
  template_id INTEGER REFERENCES email_templates(id),
  recipient_type TEXT NOT NULL DEFAULT 'primary',
  custom_email TEXT,
  include_technical INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO notification_settings_new (id, name, type, schedule, template_id, recipient_type, custom_email, include_technical, enabled, created_at, updated_at)
SELECT id, name, type, days_before, template_id, recipient_type, custom_email, include_technical, enabled, created_at, updated_at
FROM notification_settings;

DROP TABLE notification_settings;
ALTER TABLE notification_settings_new RENAME TO notification_settings;
