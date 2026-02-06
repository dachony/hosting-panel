-- Migration 0009: Make expiry_date optional in domains table
-- Originally this recreated the domains table via DROP/RENAME which caused
-- data loss on every restart (columns added by later migrations were lost).
-- Now handled in 0000_init.sql. This file is a safe no-op.
SELECT 1;
