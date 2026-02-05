import { db, schema } from '../db/index.js';
import type { Context } from 'hono';

export interface AuditLogEntry {
  action: string;
  entityType: string;
  entityId?: number;
  entityName?: string;
  details?: Record<string, unknown>;
}

export async function logAudit(c: Context, entry: AuditLogEntry): Promise<void> {
  try {
    const user = c.get('user');
    if (!user) return;

    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';

    await db.insert(schema.auditLogs).values({
      userId: user.userId,
      userName: user.name || user.email,
      userEmail: user.email,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityName: entry.entityName,
      details: entry.details,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

// Helper functions for common actions
export const audit = {
  create: (c: Context, entityType: string, entityId: number, entityName?: string, details?: Record<string, unknown>) =>
    logAudit(c, { action: 'create', entityType, entityId, entityName, details }),

  update: (c: Context, entityType: string, entityId: number, entityName?: string, details?: Record<string, unknown>) =>
    logAudit(c, { action: 'update', entityType, entityId, entityName, details }),

  delete: (c: Context, entityType: string, entityId: number, entityName?: string, details?: Record<string, unknown>) =>
    logAudit(c, { action: 'delete', entityType, entityId, entityName, details }),

  login: (c: Context, userId: number, email: string) =>
    logAudit(c, { action: 'login', entityType: 'auth', entityId: userId, entityName: email }),

  logout: (c: Context) =>
    logAudit(c, { action: 'logout', entityType: 'auth' }),

  custom: (c: Context, action: string, entityType: string, entityId?: number, entityName?: string, details?: Record<string, unknown>) =>
    logAudit(c, { action, entityType, entityId, entityName, details }),
};
