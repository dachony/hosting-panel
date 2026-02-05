-- Add 2FA fields to users table
ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN two_factor_method TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN two_factor_secret TEXT DEFAULT NULL;

-- Verification codes for email 2FA
CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'login',
  expires_at TEXT NOT NULL,
  used_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- TOTP backup codes
CREATE TABLE IF NOT EXISTS backup_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  used_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Login attempts for fail2ban
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  email TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Blocked IPs
CREATE TABLE IF NOT EXISTS blocked_ips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT,
  blocked_until TEXT,
  permanent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON blocked_ips(ip_address);
CREATE INDEX IF NOT EXISTS idx_verification_codes_user ON verification_codes(user_id);
