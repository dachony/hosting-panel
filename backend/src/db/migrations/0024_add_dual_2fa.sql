-- Add dual 2FA support: allow both email and TOTP simultaneously
ALTER TABLE users ADD COLUMN two_factor_email_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN two_factor_totp_enabled INTEGER DEFAULT 0;
