-- Add new columns to clients table
ALTER TABLE clients ADD COLUMN address TEXT;
ALTER TABLE clients ADD COLUMN pib TEXT;
ALTER TABLE clients ADD COLUMN mib TEXT;

-- Add new columns to domains table
ALTER TABLE domains ADD COLUMN contact_email1 TEXT;
ALTER TABLE domains ADD COLUMN contact_email2 TEXT;
ALTER TABLE domains ADD COLUMN contact_email3 TEXT;
