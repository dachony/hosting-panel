-- Add is_active column to mail_hosting table
ALTER TABLE mail_hosting ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
