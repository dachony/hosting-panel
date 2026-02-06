import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, superAdminMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp } from '../utils/dates.js';

const settings = new Hono();

settings.use('*', authMiddleware);

// Get all app settings
settings.get('/', async (c) => {
  const allSettings = await db.select().from(schema.appSettings);
  const settingsMap: Record<string, unknown> = {};

  for (const setting of allSettings) {
    settingsMap[setting.key] = setting.value;
  }

  return c.json({ settings: settingsMap });
});

// System settings (must be before /:key)
settings.get('/system', async (c) => {
  const setting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'system')).get();

  const defaults = {
    systemName: 'Hosting Panel',
    baseUrl: '',
  };

  if (setting?.value) {
    return c.json({ settings: { ...defaults, ...(setting.value as object) } });
  }

  return c.json({ settings: defaults });
});

settings.put('/system', superAdminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = z.object({
      systemName: z.string().min(1),
      baseUrl: z.string().optional().default(''),
    }).parse(body);

    const existing = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'system')).get();

    if (existing) {
      await db.update(schema.appSettings)
        .set({ value: data, updatedAt: getCurrentTimestamp() })
        .where(eq(schema.appSettings.key, 'system'));
    } else {
      await db.insert(schema.appSettings).values({ key: 'system', value: data });
    }

    return c.json({ settings: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// System notifications settings
const systemNotificationsSchema = z.object({
  enabled: z.boolean(),
  recipientEmail: z.string().email().or(z.literal('')),
  events: z.object({
    superadminPasswordChange: z.boolean(),
    adminPasswordChange: z.boolean(),
    userLocked: z.boolean(),
    diskUsageThreshold: z.boolean(),
    diskUsagePercent: z.number().min(50).max(99),
    cpuUsageThreshold: z.boolean(),
    cpuUsagePercent: z.number().min(50).max(99),
    memoryUsageThreshold: z.boolean(),
    memoryUsagePercent: z.number().min(50).max(99),
    databaseError: z.boolean(),
    applicationError: z.boolean(),
    applicationStart: z.boolean(),
    applicationStop: z.boolean(),
    failedLoginAttempts: z.boolean(),
    failedLoginThreshold: z.number().min(1).max(100),
    backupCompleted: z.boolean(),
    backupFailed: z.boolean(),
    sslCertExpiring: z.boolean(),
    sslCertExpiringDays: z.number().min(1).max(90),
    auditLogsThreshold: z.boolean(),
    auditLogsCount: z.number().min(100),
    emailLogsThreshold: z.boolean(),
    emailLogsCount: z.number().min(100),
    pdfSizeThreshold: z.boolean(),
    pdfSizeMb: z.number().min(10),
  }),
});

settings.get('/system-notifications', async (c) => {
  const setting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'system-notifications')).get();

  const defaults = {
    enabled: false,
    recipientEmail: '',
    events: {
      superadminPasswordChange: true,
      adminPasswordChange: true,
      userLocked: true,
      diskUsageThreshold: false,
      diskUsagePercent: 90,
      cpuUsageThreshold: false,
      cpuUsagePercent: 90,
      memoryUsageThreshold: false,
      memoryUsagePercent: 90,
      databaseError: true,
      applicationError: true,
      applicationStart: true,
      applicationStop: true,
      failedLoginAttempts: true,
      failedLoginThreshold: 5,
      backupCompleted: false,
      backupFailed: true,
      sslCertExpiring: true,
      sslCertExpiringDays: 14,
      auditLogsThreshold: false,
      auditLogsCount: 10000,
      emailLogsThreshold: false,
      emailLogsCount: 5000,
      pdfSizeThreshold: false,
      pdfSizeMb: 500,
    },
  };

  if (setting?.value) {
    const saved = setting.value as Record<string, unknown>;
    return c.json({ settings: {
      ...defaults,
      ...saved,
      events: { ...defaults.events, ...(saved.events as object || {}) },
    } });
  }

  return c.json({ settings: defaults });
});

settings.put('/system-notifications', superAdminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = systemNotificationsSchema.parse(body);

    const existing = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'system-notifications')).get();

    if (existing) {
      await db.update(schema.appSettings)
        .set({ value: data, updatedAt: getCurrentTimestamp() })
        .where(eq(schema.appSettings.key, 'system-notifications'));
    } else {
      await db.insert(schema.appSettings).values({ key: 'system-notifications', value: data });
    }

    return c.json({ settings: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Allowlist for generic /:key routes
const ALLOWED_SETTINGS_KEYS = new Set([
  'system',
  'system-notifications',
  'theme',
  'mail',
  'security',
  'backup',
]);

// Get single setting
settings.get('/:key', async (c) => {
  const key = c.req.param('key');
  const setting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).get();

  if (!setting) {
    return c.json({ error: 'Setting not found' }, 404);
  }

  return c.json({ key: setting.key, value: setting.value });
});

// Update or create setting
settings.put('/:key', superAdminMiddleware, async (c) => {
  try {
    const key = c.req.param('key');

    if (!ALLOWED_SETTINGS_KEYS.has(key)) {
      return c.json({ error: 'Setting key not allowed' }, 400);
    }

    const body = await c.req.json();
    const { value } = body;

    const existing = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).get();

    if (existing) {
      await db.update(schema.appSettings)
        .set({ value, updatedAt: getCurrentTimestamp() })
        .where(eq(schema.appSettings.key, key));
    } else {
      await db.insert(schema.appSettings).values({ key, value });
    }

    return c.json({ key, value });
  } catch (error) {
    return c.json({ error: 'Invalid input' }, 400);
  }
});

// Delete setting
settings.delete('/:key', superAdminMiddleware, async (c) => {
  const key = c.req.param('key');

  if (!ALLOWED_SETTINGS_KEYS.has(key)) {
    return c.json({ error: 'Setting key not allowed' }, 400);
  }

  const existing = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).get();
  if (!existing) {
    return c.json({ error: 'Setting not found' }, 404);
  }

  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, key));

  return c.json({ message: 'Setting deleted' });
});

// Theme settings
settings.get('/theme/current', async (c) => {
  const setting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'theme')).get();
  return c.json({ theme: setting?.value || 'light' });
});

settings.put('/theme/current', async (c) => {
  const body = await c.req.json();
  const { theme } = z.object({ theme: z.enum(['light', 'dark', 'system']) }).parse(body);

  const existing = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'theme')).get();

  if (existing) {
    await db.update(schema.appSettings)
      .set({ value: theme, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.appSettings.key, 'theme'));
  } else {
    await db.insert(schema.appSettings).values({ key: 'theme', value: theme });
  }

  return c.json({ theme });
});

export default settings;
