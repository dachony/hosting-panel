-- Update template types to new values
-- Map old types to new types
UPDATE email_templates SET type = 'client' WHERE type IN ('domain_expiry', 'hosting_expiry', 'mail_expiry');
UPDATE email_templates SET type = 'reports' WHERE type IN ('daily_report', 'weekly_report', 'monthly_report');
UPDATE email_templates SET type = 'system' WHERE type = 'custom';
