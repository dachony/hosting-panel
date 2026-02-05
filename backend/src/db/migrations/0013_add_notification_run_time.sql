-- Add run_at_time column to notification_settings
ALTER TABLE notification_settings ADD COLUMN run_at_time TEXT NOT NULL DEFAULT '09:00';
