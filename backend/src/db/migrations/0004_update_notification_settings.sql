-- Add new columns to notification_settings table for extended notification configuration
ALTER TABLE notification_settings ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE notification_settings ADD COLUMN template_id INTEGER REFERENCES email_templates(id);
ALTER TABLE notification_settings ADD COLUMN recipient_type TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE notification_settings ADD COLUMN custom_email TEXT;
ALTER TABLE notification_settings ADD COLUMN include_technical INTEGER DEFAULT 0;
