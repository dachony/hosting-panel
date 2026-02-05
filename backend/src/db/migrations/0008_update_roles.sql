-- Update existing admin users to superadmin
UPDATE users SET role = 'superadmin' WHERE role = 'admin';

-- Update any other old roles to sales
UPDATE users SET role = 'sales' WHERE role NOT IN ('superadmin', 'admin', 'salesadmin', 'sales');
