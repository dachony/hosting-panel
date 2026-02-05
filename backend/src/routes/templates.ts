import { Hono } from 'hono';
import { db, schema, ReportConfig, SystemConfig } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp } from '../utils/dates.js';
import { sendEmail } from '../services/email.js';
import { generateHostingListHtml } from '../services/reports.js';
import { generateSystemInfoHtml } from '../services/system.js';

const templates = new Hono();

templates.use('*', authMiddleware);

// Get all templates
templates.get('/', async (c) => {
  const allTemplates = await db.select().from(schema.emailTemplates);
  return c.json({ templates: allTemplates });
});

// Get single template
templates.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const template = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.id, id)).get();

  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  return c.json({ template });
});

// Get template by type
templates.get('/type/:type', async (c) => {
  const type = c.req.param('type');
  const template = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.type, type as typeof schema.emailTemplates.$inferSelect.type)).get();

  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  return c.json({ template });
});

const reportConfigSchema = z.object({
  filters: z.object({
    statuses: z.array(z.enum(['green', 'yellow', 'orange', 'red', 'forDeletion', 'deleted'])),
  }),
  sorting: z.object({
    field: z.enum(['domainName', 'clientName', 'expiryDate']),
    direction: z.enum(['asc', 'desc']),
  }),
  groupByStatus: z.boolean(),
}).nullable().optional();

const systemConfigSchema = z.object({
  sections: z.object({
    blockedIps: z.boolean(),
    lockedUsers: z.boolean(),
    failedLogins: z.boolean(),
    passwordChanges: z.boolean(),
    resourceUsage: z.boolean(),
    databaseSize: z.boolean(),
  }),
  period: z.enum(['today', 'last7days', 'last30days', 'all']),
}).nullable().optional();

const templateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['client', 'service_request', 'sales_request', 'reports', 'system']),
  subject: z.string().min(1),
  htmlContent: z.string().min(1),
  pdfTemplate: z.string().optional().nullable(),
  variables: z.array(z.string()).optional(),
  reportConfig: reportConfigSchema,
  systemConfig: systemConfigSchema,
  isActive: z.boolean().default(true),
});

// Create template
templates.post('/', adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = templateSchema.parse(body);

    const [template] = await db.insert(schema.emailTemplates).values(data).returning();

    return c.json({ template }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Update template
templates.put('/:id', adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = templateSchema.partial().parse(body);

    const existing = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.id, id)).get();
    if (!existing) {
      return c.json({ error: 'Template not found' }, 404);
    }

    const [template] = await db.update(schema.emailTemplates)
      .set({ ...data, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.emailTemplates.id, id))
      .returning();

    return c.json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Delete template
templates.delete('/:id', adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Template not found' }, 404);
  }

  await db.delete(schema.emailTemplates).where(eq(schema.emailTemplates.id, id));

  return c.json({ message: 'Template deleted' });
});

// Preview template with sample data
templates.post('/:id/preview', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { variables = {} } = body;

  const template = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.id, id)).get();

  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  // Get company logo from settings
  const companyInfo = await db.select().from(schema.companyInfo).get();
  const companyLogo = companyInfo?.logo || '';

  // Merge company data into variables
  const allVariables: Record<string, string> = {
    companyLogo,
    companyName: companyInfo?.name || 'Company Name',
    ...variables,
  };

  // If this is a report template with reportConfig, generate hostingList
  if (template.type === 'reports' && template.reportConfig) {
    const reportConfig = template.reportConfig as ReportConfig;
    const hostingListHtml = await generateHostingListHtml(reportConfig);
    allVariables.hostingList = hostingListHtml;
  }

  // If this is a system template with systemConfig, generate systemInfo
  if (template.type === 'system' && template.systemConfig) {
    const systemConfig = template.systemConfig as SystemConfig;
    const systemInfoHtml = await generateSystemInfoHtml(systemConfig);
    allVariables.systemInfo = systemInfoHtml;
  }

  // Replace variables in template
  let html = template.htmlContent;
  let subject = template.subject;

  for (const [key, value] of Object.entries(allVariables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, String(value));
    subject = subject.replace(regex, String(value));
  }

  return c.json({
    subject,
    html,
    originalTemplate: template,
  });
});

// Test template - send email with sample data
templates.post('/:id/test', adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const { email } = z.object({ email: z.string().email() }).parse(body);

    const template = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.id, id)).get();

    if (!template) {
      return c.json({ error: 'Template not found' }, 404);
    }

    // Get company info for variables
    const companyInfo = await db.select().from(schema.companyInfo).get();

    // Sample data for variables
    const variables: Record<string, string> = {
      clientName: 'Test Client',
      domainName: 'test-domain.rs',
      expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('sr-RS'),
      daysUntilExpiry: '7',
      packageName: 'Test Package',
      companyName: companyInfo?.name || 'Hosting Panel',
      companyLogo: companyInfo?.logo || '',
      hostingStatus: 'Enabled',
    };

    // If this is a report template with reportConfig, generate hostingList
    if (template.type === 'reports' && template.reportConfig) {
      const reportConfig = template.reportConfig as ReportConfig;
      const hostingListHtml = await generateHostingListHtml(reportConfig);
      variables.hostingList = hostingListHtml;
    }

    // If this is a system template with systemConfig, generate systemInfo
    if (template.type === 'system' && template.systemConfig) {
      const systemConfig = template.systemConfig as SystemConfig;
      const systemInfoHtml = await generateSystemInfoHtml(systemConfig);
      variables.systemInfo = systemInfoHtml;
    }

    // Replace variables in template
    let html = template.htmlContent;
    let subject = `[TEST] ${template.subject}`;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, value);
      subject = subject.replace(regex, value);
    }

    await sendEmail({
      to: email,
      subject,
      html,
    });

    return c.json({ message: 'Test email sent' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to send test email', details: String(error) }, 500);
  }
});

export default templates;
