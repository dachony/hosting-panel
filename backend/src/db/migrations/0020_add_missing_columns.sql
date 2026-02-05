-- Clients: columns not covered by previous migrations
ALTER TABLE `clients` ADD COLUMN `tech_contact` text;
ALTER TABLE `clients` ADD COLUMN `tech_phone` text;
ALTER TABLE `clients` ADD COLUMN `tech_email` text;

-- Domains: contact columns not included in 0009 recreate
ALTER TABLE `domains` ADD COLUMN `primary_contact_name` text;
ALTER TABLE `domains` ADD COLUMN `primary_contact_phone` text;
ALTER TABLE `domains` ADD COLUMN `primary_contact_email` text;
