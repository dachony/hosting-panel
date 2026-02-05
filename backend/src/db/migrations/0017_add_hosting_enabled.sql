-- Add isEnabled field to web_hosting table
ALTER TABLE web_hosting ADD COLUMN is_enabled INTEGER DEFAULT 1;

-- Update existing records to be enabled by default
UPDATE web_hosting SET is_enabled = 1 WHERE is_enabled IS NULL;
