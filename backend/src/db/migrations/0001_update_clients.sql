-- Add new columns to clients table
ALTER TABLE clients ADD COLUMN domain text;
ALTER TABLE clients ADD COLUMN contact_person text;
ALTER TABLE clients ADD COLUMN email1 text;
ALTER TABLE clients ADD COLUMN email2 text;
ALTER TABLE clients ADD COLUMN email3 text;

-- Migrate old email to email1
UPDATE clients SET email1 = email WHERE email IS NOT NULL;
