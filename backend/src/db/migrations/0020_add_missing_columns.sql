-- Clients: missing columns from schema
ALTER TABLE `clients` ADD COLUMN `tech_contact` text;
ALTER TABLE `clients` ADD COLUMN `tech_phone` text;
ALTER TABLE `clients` ADD COLUMN `tech_email` text;
ALTER TABLE `clients` ADD COLUMN `pib` text;
ALTER TABLE `clients` ADD COLUMN `mib` text;

-- Domains: missing contact columns from schema
ALTER TABLE `domains` ADD COLUMN `primary_contact_name` text;
ALTER TABLE `domains` ADD COLUMN `primary_contact_phone` text;
ALTER TABLE `domains` ADD COLUMN `primary_contact_email` text;
ALTER TABLE `domains` ADD COLUMN `contact_email1` text;
ALTER TABLE `domains` ADD COLUMN `contact_email2` text;
ALTER TABLE `domains` ADD COLUMN `contact_email3` text;
