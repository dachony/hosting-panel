-- Template recipients and image sizes
ALTER TABLE email_templates ADD COLUMN recipients TEXT DEFAULT NULL;
ALTER TABLE email_templates ADD COLUMN header_logo_size TEXT DEFAULT 'medium';
ALTER TABLE email_templates ADD COLUMN header_image_size TEXT DEFAULT 'medium';
ALTER TABLE email_templates ADD COLUMN signature_logo_size TEXT DEFAULT 'medium';
ALTER TABLE email_templates ADD COLUMN footer_image_size TEXT DEFAULT 'medium';

-- CC email in email logs
ALTER TABLE email_logs ADD COLUMN cc_email TEXT DEFAULT NULL;
