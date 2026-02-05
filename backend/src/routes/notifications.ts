import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, adminMiddleware, superAdminMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp } from '../utils/dates.js';
import { sendTestEmail, testSmtpConnection } from '../services/email.js';

const mailSettingsSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  user: z.string().optional().default(''),
  password: z.string().optional().default(''),
  fromEmail: z.string().email(),
  fromName: z.string().optional().default(''),
  imapPort: z.number().int().min(1).max(65535).default(993),
  imapSecure: z.boolean().default(true),
});

const notifications = new Hono();

notifications.use('*', authMiddleware);

const notificationSettingsSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['client', 'service_request', 'sales_request', 'reports', 'system']),
  schedule: z.array(z.number().int().min(-60).max(60)), // negative = after expiry, 0 = day of expiry, positive = before expiry
  runAtTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).default('09:00'), // HH:MM format
  templateId: z.number().int().nullable().optional(),
  recipientType: z.enum(['custom', 'primary']).default('primary'),
  customEmail: z.string().email().nullable().optional(),
  includeTechnical: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

const reportSettingsSchema = z.object({
  name: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  recipients: z.array(z.string().email()).min(1),
  enabled: z.boolean().default(true),
});

// Notification settings
notifications.get('/settings', async (c) => {
  const settings = await db.select({
    id: schema.notificationSettings.id,
    name: schema.notificationSettings.name,
    type: schema.notificationSettings.type,
    schedule: schema.notificationSettings.schedule,
    runAtTime: schema.notificationSettings.runAtTime,
    templateId: schema.notificationSettings.templateId,
    templateName: schema.emailTemplates.name,
    recipientType: schema.notificationSettings.recipientType,
    customEmail: schema.notificationSettings.customEmail,
    includeTechnical: schema.notificationSettings.includeTechnical,
    enabled: schema.notificationSettings.enabled,
    createdAt: schema.notificationSettings.createdAt,
    updatedAt: schema.notificationSettings.updatedAt,
  })
    .from(schema.notificationSettings)
    .leftJoin(schema.emailTemplates, eq(schema.notificationSettings.templateId, schema.emailTemplates.id));
  return c.json({ settings });
});

// Create notification setting
notifications.post('/settings', adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = notificationSettingsSchema.parse(body);

    const [setting] = await db.insert(schema.notificationSettings).values(data).returning();

    return c.json({ setting }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

notifications.put('/settings/:id', adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = notificationSettingsSchema.partial().parse(body);

    const existing = await db.select().from(schema.notificationSettings).where(eq(schema.notificationSettings.id, id)).get();
    if (!existing) {
      return c.json({ error: 'Setting not found' }, 404);
    }

    const [setting] = await db.update(schema.notificationSettings)
      .set({ ...data, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.notificationSettings.id, id))
      .returning();

    return c.json({ setting });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

notifications.delete('/settings/:id', adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.notificationSettings).where(eq(schema.notificationSettings.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Setting not found' }, 404);
  }

  await db.delete(schema.notificationSettings).where(eq(schema.notificationSettings.id, id));

  return c.json({ message: 'Notification setting deleted' });
});

// Report settings
notifications.get('/reports', async (c) => {
  const reports = await db.select().from(schema.reportSettings);
  return c.json({ reports });
});

notifications.post('/reports', adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = reportSettingsSchema.parse(body);

    const [report] = await db.insert(schema.reportSettings).values(data).returning();

    return c.json({ report }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

notifications.put('/reports/:id', adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = reportSettingsSchema.partial().parse(body);

    const existing = await db.select().from(schema.reportSettings).where(eq(schema.reportSettings.id, id)).get();
    if (!existing) {
      return c.json({ error: 'Report not found' }, 404);
    }

    const [report] = await db.update(schema.reportSettings)
      .set({ ...data, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.reportSettings.id, id))
      .returning();

    return c.json({ report });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

notifications.delete('/reports/:id', adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.reportSettings).where(eq(schema.reportSettings.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Report not found' }, 404);
  }

  await db.delete(schema.reportSettings).where(eq(schema.reportSettings.id, id));

  return c.json({ message: 'Report deleted' });
});

// Notification log
notifications.get('/log', async (c) => {
  const logs = await db.select().from(schema.notificationLog).orderBy(schema.notificationLog.sentAt);
  return c.json({ logs });
});

// Mail Settings (SMTP + IMAP combined)
notifications.get('/mail-settings', async (c) => {
  const setting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'mail-settings')).get();

  // Default settings
  const defaults = {
    host: 'localhost',
    port: 1025,
    secure: false,
    user: '',
    password: '',
    fromEmail: 'noreply@hosting-dashboard.local',
    fromName: 'Hosting Panel',
    imapPort: 993,
    imapSecure: true,
  };

  if (setting?.value) {
    const saved = setting.value as Record<string, unknown>;
    return c.json({
      settings: {
        ...defaults,
        ...saved,
        password: saved.password ? '********' : '', // Mask password
      },
    });
  }

  return c.json({ settings: defaults });
});

notifications.put('/mail-settings', superAdminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = mailSettingsSchema.parse(body);

    // Get existing settings to preserve password if not changed
    const existing = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'mail-settings')).get();

    let finalData = { ...data };

    // If password is masked placeholder, keep the old password
    if (data.password === '********' && existing?.value) {
      const oldSettings = existing.value as Record<string, unknown>;
      finalData.password = oldSettings.password as string || '';
    }

    if (existing) {
      await db.update(schema.appSettings)
        .set({ value: finalData, updatedAt: getCurrentTimestamp() })
        .where(eq(schema.appSettings.key, 'mail-settings'));
    } else {
      await db.insert(schema.appSettings).values({ key: 'mail-settings', value: finalData });
    }

    return c.json({
      settings: {
        ...finalData,
        password: finalData.password ? '********' : '',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Test SMTP connection
notifications.post('/smtp/verify', superAdminMiddleware, async (c) => {
  try {
    const result = await testSmtpConnection();

    if (result.success) {
      return c.json({ message: 'SMTP connection successful' });
    } else {
      return c.json({ error: 'SMTP connection failed', details: result.error }, 400);
    }
  } catch (error) {
    return c.json({ error: 'SMTP connection failed', details: String(error) }, 500);
  }
});

// Test SMTP by sending email
notifications.post('/smtp/test', adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { email } = z.object({ email: z.string().email() }).parse(body);

    await sendTestEmail(email);

    return c.json({ message: 'Test email sent successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to send test email', details: String(error) }, 500);
  }
});

// Test notification setting
notifications.post('/settings/:id/test', adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const { email } = z.object({ email: z.string().email() }).parse(body);

    const setting = await db.select({
      id: schema.notificationSettings.id,
      name: schema.notificationSettings.name,
      type: schema.notificationSettings.type,
      schedule: schema.notificationSettings.schedule,
      templateId: schema.notificationSettings.templateId,
    })
      .from(schema.notificationSettings)
      .where(eq(schema.notificationSettings.id, id))
      .get();

    if (!setting) {
      return c.json({ error: 'Notification setting not found' }, 404);
    }

    // Get template if exists
    let htmlContent = '';
    let subject = '';

    if (setting.templateId) {
      const template = await db.select()
        .from(schema.emailTemplates)
        .where(eq(schema.emailTemplates.id, setting.templateId))
        .get();

      if (template) {
        subject = template.subject
          .replace(/\{\{clientName\}\}/g, 'Test Klijent')
          .replace(/\{\{domainName\}\}/g, 'test-domain.rs')
          .replace(/\{\{expiryDate\}\}/g, new Date().toLocaleDateString('sr-RS'))
          .replace(/\{\{daysUntilExpiry\}\}/g, '7')
          .replace(/\{\{packageName\}\}/g, 'Test Paket');

        htmlContent = template.htmlContent
          .replace(/\{\{clientName\}\}/g, 'Test Klijent')
          .replace(/\{\{domainName\}\}/g, 'test-domain.rs')
          .replace(/\{\{expiryDate\}\}/g, new Date().toLocaleDateString('sr-RS'))
          .replace(/\{\{daysUntilExpiry\}\}/g, '7')
          .replace(/\{\{packageName\}\}/g, 'Test Paket');
      }
    }

    if (!htmlContent) {
      const typeLabels = { domain: 'Domen', hosting: 'Web Hosting', mail: 'Mail Hosting' };
      subject = `[TEST] ${setting.name || typeLabels[setting.type]} - Expiry notification`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Test Notifikacija</h2>
          <p>This is a test notification for setting: <strong>${setting.name || typeLabels[setting.type]}</strong></p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Tip:</strong></td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${typeLabels[setting.type]}</td></tr>
            <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Days before expiry:</strong></td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${setting.daysBefore.join(', ')}</td></tr>
          </table>
          <p style="color: #6b7280; font-size: 14px;">This is a test email. In production, you will receive real notifications with client and domain data.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px;">Hosting Panel - Test</p>
        </div>
      `;
    }

    // Send with the notification content
    const { sendEmail } = await import('../services/email.js');
    await sendEmail({
      to: email,
      subject,
      html: htmlContent,
    });

    return c.json({ message: 'Test notification sent' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to send test notification', details: String(error) }, 500);
  }
});

// Test IMAP connection
notifications.post('/imap/verify', superAdminMiddleware, async (c) => {
  try {
    const setting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'mail-settings')).get();

    if (!setting?.value) {
      return c.json({ error: 'Mail settings not configured' }, 400);
    }

    const mailConfig = setting.value as Record<string, unknown>;

    if (!mailConfig.host) {
      return c.json({ error: 'Mail server not configured' }, 400);
    }

    // Dynamic import of imap library
    const Imap = (await import('imap')).default;

    const imap = new Imap({
      user: mailConfig.user as string,
      password: mailConfig.password as string,
      host: mailConfig.host as string,
      port: mailConfig.imapPort as number || 993,
      tls: mailConfig.imapSecure as boolean ?? true,
      tlsOptions: { rejectUnauthorized: false },
    });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        imap.end();
        resolve(c.json({ error: 'IMAP connection timeout' }, 400));
      }, 10000);

      imap.once('ready', () => {
        clearTimeout(timeout);
        imap.end();
        resolve(c.json({ message: 'IMAP connection successful' }));
      });

      imap.once('error', (err: Error) => {
        clearTimeout(timeout);
        resolve(c.json({ error: 'IMAP connection failed', details: err.message }, 400));
      });

      imap.connect();
    });
  } catch (error) {
    return c.json({ error: 'IMAP connection failed', details: String(error) }, 500);
  }
});

export default notifications;
