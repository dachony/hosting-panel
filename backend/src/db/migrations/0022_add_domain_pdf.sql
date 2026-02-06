-- Add PDF filename column to domains
ALTER TABLE domains ADD COLUMN pdf_filename TEXT;

-- Add attach_domain_pdf option to email templates
ALTER TABLE email_templates ADD COLUMN attach_domain_pdf INTEGER DEFAULT 0;
