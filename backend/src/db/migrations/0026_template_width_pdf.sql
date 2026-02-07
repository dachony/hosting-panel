-- Template width format and report PDF option
ALTER TABLE email_templates ADD COLUMN template_width TEXT DEFAULT 'standard';
ALTER TABLE email_templates ADD COLUMN send_as_pdf INTEGER DEFAULT 0;
