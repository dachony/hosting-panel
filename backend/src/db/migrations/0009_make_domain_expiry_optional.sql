-- Make expiry_date optional in domains table
-- SQLite requires recreating the table to change column constraints

-- Create new table without NOT NULL on expiry_date
-- Only includes columns that exist at this migration step (0000 + 0001 + 0002)
CREATE TABLE IF NOT EXISTS domains_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  domain_name TEXT NOT NULL UNIQUE,
  registrar TEXT,
  registration_date TEXT,
  expiry_date TEXT,
  auto_renew INTEGER DEFAULT 0,
  contact_email1 TEXT,
  contact_email2 TEXT,
  contact_email3 TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table (only columns that exist at this point)
INSERT OR IGNORE INTO domains_new (id, client_id, domain_name, registrar, registration_date, expiry_date, auto_renew, contact_email1, contact_email2, contact_email3, notes, created_at, updated_at)
SELECT id, client_id, domain_name, registrar, registration_date, expiry_date, auto_renew, contact_email1, contact_email2, contact_email3, notes, created_at, updated_at FROM domains;

-- Drop old table
DROP TABLE IF EXISTS domains;

-- Rename new table
ALTER TABLE domains_new RENAME TO domains;
