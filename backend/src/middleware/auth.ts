import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

export type UserRole = 'superadmin' | 'admin' | 'salesadmin' | 'sales';

export interface JWTPayload {
  userId: number;
  email: string;
  role: UserRole;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

export type AppEnv = {
  Variables: {
    user: AuthUser;
  };
};

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

// Role hierarchy helpers
export function isSuperAdmin(role: UserRole): boolean {
  return role === 'superadmin';
}

export function isAdmin(role: UserRole): boolean {
  return role === 'superadmin' || role === 'admin';
}

export function isSalesAdmin(role: UserRole): boolean {
  return role === 'superadmin' || role === 'admin' || role === 'salesadmin';
}

export function canManageSystem(role: UserRole): boolean {
  // Only superadmin can manage system settings (mail, system name, security, users/roles)
  return role === 'superadmin';
}

export function canManageContent(role: UserRole): boolean {
  // Superadmin and admin can manage all content (templates, notifications, servers, etc.)
  return role === 'superadmin' || role === 'admin';
}

export function canManagePackages(role: UserRole): boolean {
  // Superadmin, admin, and salesadmin can view packages
  // But salesadmin can only ADD, not edit/delete
  return role === 'superadmin' || role === 'admin' || role === 'salesadmin';
}

export function canEditPackages(role: UserRole): boolean {
  // Only superadmin and admin can edit/delete packages
  return role === 'superadmin' || role === 'admin';
}

export function canManageClients(role: UserRole): boolean {
  // All roles can manage clients
  return true;
}

// Basic auth middleware - requires authentication
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const user = await db.select().from(schema.users).where(eq(schema.users.id, payload.userId)).get();

  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  c.set('user', {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
  });

  await next();
}

// Super Admin only - system settings, user management
export async function superAdminMiddleware(c: Context, next: Next) {
  const user = c.get('user') as AuthUser;

  if (!user || !isSuperAdmin(user.role)) {
    return c.json({ error: 'Super Administrator access required' }, 403);
  }

  await next();
}

// Admin or higher - content management (templates, notifications, mail servers, etc.)
export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get('user') as AuthUser;

  if (!user || !isAdmin(user.role)) {
    return c.json({ error: 'Administrator access required' }, 403);
  }

  await next();
}

// Sales Admin or higher - can view/add packages
export async function salesAdminMiddleware(c: Context, next: Next) {
  const user = c.get('user') as AuthUser;

  if (!user || !isSalesAdmin(user.role)) {
    return c.json({ error: 'Sales Admin access required' }, 403);
  }

  await next();
}

// Middleware to check if user can edit packages (not for salesadmin)
export async function packageEditMiddleware(c: Context, next: Next) {
  const user = c.get('user') as AuthUser;

  if (!user || !canEditPackages(user.role)) {
    return c.json({ error: 'You do not have permission to edit packages' }, 403);
  }

  await next();
}
