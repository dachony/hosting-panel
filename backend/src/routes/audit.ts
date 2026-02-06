import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { desc, eq, like, or, and, gte, lte, lt, sql } from 'drizzle-orm';
import { authMiddleware, superAdminMiddleware } from '../middleware/auth.js';
import { safeParseInt, isValidIsoDate, escapeLike } from '../utils/validation.js';

const audit = new Hono();

audit.use('*', authMiddleware);

// Get audit logs with filtering and pagination
audit.get('/', async (c) => {
  const page = safeParseInt(c.req.query('page'), 1) ?? 1;
  const limit = Math.min(safeParseInt(c.req.query('limit'), 50) ?? 50, 200);
  const search = c.req.query('search') || '';
  const entityType = c.req.query('entityType') || '';
  const action = c.req.query('action') || '';
  const userId = c.req.query('userId') || '';
  const dateFrom = c.req.query('dateFrom') || '';
  const dateTo = c.req.query('dateTo') || '';

  if (dateFrom && !isValidIsoDate(dateFrom)) {
    return c.json({ error: 'Invalid dateFrom format (expected YYYY-MM-DD)' }, 400);
  }
  if (dateTo && !isValidIsoDate(dateTo)) {
    return c.json({ error: 'Invalid dateTo format (expected YYYY-MM-DD)' }, 400);
  }

  const offset = (page - 1) * limit;

  // Build conditions
  const conditions = [];

  if (search) {
    const escaped = escapeLike(search);
    conditions.push(
      or(
        like(schema.auditLogs.userName, `%${escaped}%`),
        like(schema.auditLogs.userEmail, `%${escaped}%`),
        like(schema.auditLogs.entityName, `%${escaped}%`),
        like(schema.auditLogs.action, `%${escaped}%`),
        like(schema.auditLogs.entityType, `%${escaped}%`)
      )
    );
  }

  if (entityType) {
    conditions.push(eq(schema.auditLogs.entityType, entityType));
  }

  if (action) {
    conditions.push(eq(schema.auditLogs.action, action));
  }

  if (userId) {
    const parsedUserId = safeParseInt(userId);
    if (parsedUserId !== null) {
      conditions.push(eq(schema.auditLogs.userId, parsedUserId));
    }
  }

  if (dateFrom) {
    conditions.push(gte(schema.auditLogs.createdAt, dateFrom));
  }

  if (dateTo) {
    conditions.push(lte(schema.auditLogs.createdAt, dateTo + 'T23:59:59'));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db
    .select({ count: schema.auditLogs.id })
    .from(schema.auditLogs)
    .where(whereClause);

  const total = countResult.length;

  // Get logs
  const logs = await db
    .select()
    .from(schema.auditLogs)
    .where(whereClause)
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get unique entity types for filtering
audit.get('/entity-types', async (c) => {
  const result = await db
    .selectDistinct({ entityType: schema.auditLogs.entityType })
    .from(schema.auditLogs);

  return c.json({ entityTypes: result.map(r => r.entityType) });
});

// Get unique actions for filtering
audit.get('/actions', async (c) => {
  const result = await db
    .selectDistinct({ action: schema.auditLogs.action })
    .from(schema.auditLogs);

  return c.json({ actions: result.map(r => r.action) });
});

// Get audit log statistics
audit.get('/stats', async (c) => {
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.auditLogs);

  const total = countResult[0]?.count || 0;

  // Get oldest and newest log dates
  const oldestResult = await db
    .select({ date: schema.auditLogs.createdAt })
    .from(schema.auditLogs)
    .orderBy(schema.auditLogs.createdAt)
    .limit(1);

  const newestResult = await db
    .select({ date: schema.auditLogs.createdAt })
    .from(schema.auditLogs)
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(1);

  // Estimate size (average ~500 bytes per log entry)
  const estimatedSize = total * 500;

  // Count by age
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const olderThan30 = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.auditLogs)
    .where(lt(schema.auditLogs.createdAt, thirtyDaysAgo));

  const olderThan90 = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.auditLogs)
    .where(lt(schema.auditLogs.createdAt, ninetyDaysAgo));

  const olderThan1Year = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.auditLogs)
    .where(lt(schema.auditLogs.createdAt, oneYearAgo));

  return c.json({
    total,
    estimatedSize,
    oldestLog: oldestResult[0]?.date || null,
    newestLog: newestResult[0]?.date || null,
    olderThan30Days: olderThan30[0]?.count || 0,
    olderThan90Days: olderThan90[0]?.count || 0,
    olderThan1Year: olderThan1Year[0]?.count || 0,
  });
});

// Delete old audit logs (superadmin only)
audit.delete('/old', superAdminMiddleware, async (c) => {
  const days = safeParseInt(c.req.query('days'), 90) ?? 90;

  if (days < 0) {
    return c.json({ error: 'Invalid days parameter' }, 400);
  }

  // days=0 means delete all
  if (days === 0) {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.auditLogs);
    const deleteCount = countResult[0]?.count || 0;

    if (deleteCount === 0) {
      return c.json({ message: 'No logs to delete', deleted: 0 });
    }

    await db.delete(schema.auditLogs);

    return c.json({
      message: `Deleted all ${deleteCount} audit logs`,
      deleted: deleteCount
    });
  }

  if (days < 30) {
    return c.json({ error: 'Minimum retention period is 30 days' }, 400);
  }

  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.auditLogs)
    .where(lt(schema.auditLogs.createdAt, cutoffDate));

  const deleteCount = countResult[0]?.count || 0;

  if (deleteCount === 0) {
    return c.json({ message: 'No logs to delete', deleted: 0 });
  }

  await db
    .delete(schema.auditLogs)
    .where(lt(schema.auditLogs.createdAt, cutoffDate));

  return c.json({
    message: `Deleted ${deleteCount} audit logs older than ${days} days`,
    deleted: deleteCount
  });
});

// Export audit logs
audit.get('/export', superAdminMiddleware, async (c) => {
  const format = c.req.query('format') || 'json';
  const days = safeParseInt(c.req.query('days'), 0) ?? 0;

  let whereClause;
  if (days > 0) {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    whereClause = gte(schema.auditLogs.createdAt, cutoffDate);
  }

  const logs = await db
    .select()
    .from(schema.auditLogs)
    .where(whereClause)
    .orderBy(desc(schema.auditLogs.createdAt));

  if (format === 'csv') {
    const headers = ['ID', 'Date', 'User', 'Email', 'Action', 'Type', 'Entity', 'IP Address', 'Details'];
    const rows = logs.map(log => [
      log.id,
      log.createdAt,
      log.userName,
      log.userEmail,
      log.action,
      log.entityType,
      log.entityName || '',
      log.ipAddress || '',
      log.details ? JSON.stringify(log.details) : ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
    return c.body(csv);
  }

  // JSON format
  c.header('Content-Type', 'application/json');
  c.header('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.json"`);
  return c.json(logs);
});

export default audit;
