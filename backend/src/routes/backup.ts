import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

const backup = new Hono();

backup.use('*', authMiddleware, adminMiddleware);

// Types of data that can be exported/imported
type ExportType = 'clients' | 'domains' | 'hosting' | 'packages' | 'templates' | 'scheduler' | 'settings';

// CSV Templates for each entity type
const csvTemplates: Record<string, { headers: string[]; example: string[] }> = {
  clients: {
    headers: ['name', 'contactPerson', 'phone', 'email1', 'email2', 'email3', 'techContact', 'techPhone', 'techEmail', 'address', 'pib', 'mib', 'notes'],
    example: ['Acme Corp', 'John Smith', '+381601234567', 'info@acme.com', 'sales@acme.com', '', 'Mike Johnson', '+381609876543', 'it@acme.com', '123 Main Street, City', '123456789', '12345678', 'Notes'],
  },
  domains: {
    headers: ['domainName', 'clientName', 'contactEmail1', 'contactEmail2', 'contactEmail3', 'notes'],
    example: ['example.com', 'Acme Corp', 'admin@example.com', 'webmaster@example.com', '', 'Registered with NIC'],
  },
  hosting: {
    headers: ['domainName', 'clientName', 'packageName', 'startDate', 'expiryDate', 'isActive', 'notes'],
    example: ['example.com', 'Acme Corp', 'Basic', '2024-01-01', '2025-01-01', 'true', 'Annual package'],
  },
  packages: {
    headers: ['name', 'description', 'maxMailboxes', 'storageGb', 'price', 'features'],
    example: ['Basic', 'Basic hosting package', '5', '10', '1200', 'Email|SSL|Backup'],
  },
};

// Get CSV template
backup.get('/template/:type', async (c) => {
  const type = c.req.param('type') as string;
  const template = csvTemplates[type];

  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  const csvContent = [
    template.headers.join(','),
    template.example.map(v => `"${v}"`).join(','),
  ].join('\n');

  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${type}-template.csv"`);

  return c.text(csvContent);
});

// Export data (selective)
backup.get('/export', async (c) => {
  const types = c.req.query('types')?.split(',') as ExportType[] || ['all'];
  const format = c.req.query('format') || 'json';
  const exportAll = types.includes('all' as ExportType);

  const data: Record<string, unknown[]> = {};

  // Export clients
  if (exportAll || types.includes('clients')) {
    data.clients = await db.select().from(schema.clients);
  }

  // Export domains
  if (exportAll || types.includes('domains')) {
    data.domains = await db.select().from(schema.domains);
  }

  // Export hosting (web + mail)
  if (exportAll || types.includes('hosting')) {
    const [webHosting, mailHosting] = await Promise.all([
      db.select().from(schema.webHosting),
      db.select().from(schema.mailHosting),
    ]);
    data.webHosting = webHosting;
    data.mailHosting = mailHosting;
  }

  // Export packages
  if (exportAll || types.includes('packages')) {
    const [mailPackages, mailServers, mailSecurity] = await Promise.all([
      db.select().from(schema.mailPackages),
      db.select().from(schema.mailServers),
      db.select().from(schema.mailSecurity),
    ]);
    data.packages = mailPackages;
    data.mailServers = mailServers;
    data.mailSecurity = mailSecurity;
  }

  // Export templates
  if (exportAll || types.includes('templates')) {
    data.templates = await db.select().from(schema.emailTemplates);
  }

  // Export scheduler (notification settings)
  if (exportAll || types.includes('scheduler')) {
    const [notifications, reports] = await Promise.all([
      db.select().from(schema.notificationSettings),
      db.select().from(schema.reportSettings),
    ]);
    data.notificationSettings = notifications;
    data.reportSettings = reports;
  }

  // Export settings
  if (exportAll || types.includes('settings')) {
    const [appSettings, companyInfo, bankAccounts] = await Promise.all([
      db.select().from(schema.appSettings),
      db.select().from(schema.companyInfo),
      db.select().from(schema.bankAccounts),
    ]);
    data.appSettings = appSettings;
    data.companyInfo = companyInfo;
    data.bankAccounts = bankAccounts;
  }

  if (format === 'csv') {
    // For CSV, only export one type at a time
    const type = types[0];
    const items = data[type === 'hosting' ? 'webHosting' : type] as Record<string, unknown>[];

    if (!items || items.length === 0) {
      return c.text('No data to export', 200);
    }

    // Get headers from first item
    const headers = Object.keys(items[0]);
    const csvLines = [headers.join(',')];

    for (const item of items) {
      const values = headers.map(h => {
        const val = item[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvLines.push(values.join(','));
    }

    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${type}-export-${new Date().toISOString().split('T')[0]}.csv"`);

    return c.text(csvLines.join('\n'));
  }

  // JSON export
  const exportData = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    types: exportAll ? ['all'] : types,
    data,
  };

  c.header('Content-Type', 'application/json');
  c.header('Content-Disposition', `attachment; filename="hosting-dashboard-backup-${new Date().toISOString().split('T')[0]}.json"`);

  return c.json(exportData);
});

// Validation schemas for each entity type
const clientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email1: z.string().email('Email 1 is not valid').optional().nullable().or(z.literal('')),
  email2: z.string().email('Email 2 is not valid').optional().nullable().or(z.literal('')),
  email3: z.string().email('Email 3 is not valid').optional().nullable().or(z.literal('')),
  techContact: z.string().optional().nullable(),
  techPhone: z.string().optional().nullable(),
  techEmail: z.string().email('Tech email is not valid').optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  pib: z.string().optional().nullable(),
  mib: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const domainSchema = z.object({
  domainName: z.string().min(1, 'Domain name is required'),
  clientName: z.string().optional().nullable(),
  clientId: z.number().optional().nullable(),
  contactEmail1: z.string().email('Email 1 is not valid').optional().nullable().or(z.literal('')),
  contactEmail2: z.string().email('Email 2 is not valid').optional().nullable().or(z.literal('')),
  contactEmail3: z.string().email('Email 3 is not valid').optional().nullable().or(z.literal('')),
  notes: z.string().optional().nullable(),
});

const hostingSchema = z.object({
  domainName: z.string().optional().nullable(),
  domainId: z.number().optional().nullable(),
  clientName: z.string().optional().nullable(),
  clientId: z.number().optional().nullable(),
  packageName: z.string().optional().nullable(),
  packageId: z.number().optional().nullable(),
  startDate: z.string().optional().nullable(),
  expiryDate: z.string().min(1, 'Expiry date is required'),
  isActive: z.union([z.boolean(), z.string()]).transform(v => v === true || v === 'true').optional(),
  notes: z.string().optional().nullable(),
});

const packageSchema = z.object({
  name: z.string().min(1, 'Package name is required'),
  description: z.string().optional().nullable(),
  maxMailboxes: z.union([z.number(), z.string()]).transform(v => typeof v === 'string' ? parseInt(v) || 0 : v),
  storageGb: z.union([z.number(), z.string()]).transform(v => typeof v === 'string' ? parseInt(v) || 0 : v),
  price: z.union([z.number(), z.string()]).transform(v => typeof v === 'string' ? parseFloat(v) || 0 : v),
  features: z.string().optional().nullable(),
});

// Validate import data
backup.post('/validate', async (c) => {
  try {
    const body = await c.req.json();
    const { type, data, format } = body;

    const errors: { row: number; field: string; message: string }[] = [];
    const validItems: unknown[] = [];

    let items: Record<string, unknown>[];

    if (format === 'csv') {
      // Parse CSV data
      const lines = (data as string).split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        return c.json({ valid: false, errors: [{ row: 0, field: '', message: 'CSV must have a header and at least one data row' }] }, 400);
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      items = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const item: Record<string, unknown> = {};
        headers.forEach((h, j) => {
          item[h] = values[j]?.trim() || null;
        });
        items.push(item);
      }
    } else {
      items = data as Record<string, unknown>[];
    }

    // Validate each item based on type
    let itemSchema: z.ZodType;
    switch (type) {
      case 'clients':
        itemSchema = clientSchema;
        break;
      case 'domains':
        itemSchema = domainSchema;
        break;
      case 'hosting':
        itemSchema = hostingSchema;
        break;
      case 'packages':
        itemSchema = packageSchema;
        break;
      default:
        return c.json({ valid: false, errors: [{ row: 0, field: '', message: 'Unknown data type' }] }, 400);
    }

    for (let i = 0; i < items.length; i++) {
      const result = itemSchema.safeParse(items[i]);
      if (!result.success) {
        for (const error of result.error.errors) {
          errors.push({
            row: i + 1,
            field: error.path.join('.'),
            message: error.message,
          });
        }
      } else {
        validItems.push(result.data);
      }
    }

    return c.json({
      valid: errors.length === 0,
      totalRows: items.length,
      validRows: validItems.length,
      errors,
      preview: validItems.slice(0, 5),
    });
  } catch (error) {
    return c.json({ valid: false, errors: [{ row: 0, field: '', message: 'Error parsing data' }] }, 400);
  }
});

// Parse CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

// Import data with validation
const importSchemaV2 = z.object({
  version: z.string().optional(),
  exportedAt: z.string().optional(),
  type: z.string().optional(),
  format: z.string().optional(),
  data: z.any(),
});

backup.post('/import', async (c) => {
  try {
    const body = await c.req.json();
    const importData = importSchemaV2.parse(body);

    const results: Record<string, { imported: number; skipped: number; errors: string[] }> = {};

    // Handle single type import (CSV or selected JSON)
    if (importData.type) {
      const type = importData.type;
      let items: Record<string, unknown>[];

      if (importData.format === 'csv') {
        const lines = (importData.data as string).split('\n').filter(l => l.trim());
        if (lines.length < 2) {
          return c.json({ error: 'CSV must have a header and at least one data row' }, 400);
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        items = [];

        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const item: Record<string, unknown> = {};
          headers.forEach((h, j) => {
            item[h] = values[j]?.trim() || null;
          });
          items.push(item);
        }
      } else {
        items = Array.isArray(importData.data) ? importData.data : [importData.data];
      }

      results[type] = await importItems(type, items);
    } else if (importData.data && typeof importData.data === 'object') {
      // Handle full backup import (JSON with multiple types)
      const data = importData.data as Record<string, unknown[]>;

      if (data.clients) {
        results.clients = await importItems('clients', data.clients as Record<string, unknown>[]);
      }
      if (data.domains) {
        results.domains = await importItems('domains', data.domains as Record<string, unknown>[]);
      }
      if (data.packages) {
        results.packages = await importItems('packages', data.packages as Record<string, unknown>[]);
      }
      if (data.webHosting) {
        results.webHosting = await importItems('hosting', data.webHosting as Record<string, unknown>[]);
      }
      if (data.mailHosting) {
        results.mailHosting = await importItems('mailHosting', data.mailHosting as Record<string, unknown>[]);
      }
      if (data.templates) {
        results.templates = await importItems('templates', data.templates as Record<string, unknown>[]);
      }
      if (data.notificationSettings) {
        results.notificationSettings = await importItems('notificationSettings', data.notificationSettings as Record<string, unknown>[]);
      }
      if (data.appSettings) {
        results.appSettings = await importItems('appSettings', data.appSettings as Record<string, unknown>[]);
      }
    }

    return c.json({
      message: 'Import completed',
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid file format', details: error.errors }, 400);
    }
    console.error('Import error:', error);
    return c.json({ error: 'Error during import' }, 500);
  }
});

// Import items based on type
async function importItems(type: string, items: Record<string, unknown>[]): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] };

  for (const item of items) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, updatedAt, ...data } = item;

      switch (type) {
        case 'clients': {
          const validated = clientSchema.parse(data);
          await db.insert(schema.clients).values(validated as typeof schema.clients.$inferInsert).onConflictDoNothing();
          result.imported++;
          break;
        }
        case 'domains': {
          const validated = domainSchema.parse(data);
          // Try to find client by name if clientName provided
          if (validated.clientName && !validated.clientId) {
            const client = await db.select().from(schema.clients).where(eq(schema.clients.name, validated.clientName)).get();
            if (client) {
              (validated as { clientId?: number }).clientId = client.id;
            }
          }
          await db.insert(schema.domains).values(validated as typeof schema.domains.$inferInsert).onConflictDoNothing();
          result.imported++;
          break;
        }
        case 'hosting': {
          const validated = hostingSchema.parse(data);
          // Try to find client, domain, package by name
          if (validated.clientName && !validated.clientId) {
            const client = await db.select().from(schema.clients).where(eq(schema.clients.name, validated.clientName)).get();
            if (client) (validated as { clientId?: number }).clientId = client.id;
          }
          if (validated.domainName && !validated.domainId) {
            const domain = await db.select().from(schema.domains).where(eq(schema.domains.domainName, validated.domainName)).get();
            if (domain) (validated as { domainId?: number }).domainId = domain.id;
          }
          if (validated.packageName && !validated.packageId) {
            const pkg = await db.select().from(schema.mailPackages).where(eq(schema.mailPackages.name, validated.packageName)).get();
            if (pkg) (validated as { packageId?: number }).packageId = pkg.id;
          }
          await db.insert(schema.webHosting).values(validated as typeof schema.webHosting.$inferInsert).onConflictDoNothing();
          result.imported++;
          break;
        }
        case 'packages': {
          const validated = packageSchema.parse(data);
          const features = validated.features ? validated.features.split('|') : null;
          await db.insert(schema.mailPackages).values({
            name: validated.name,
            description: validated.description,
            maxMailboxes: validated.maxMailboxes,
            storageGb: validated.storageGb,
            price: validated.price,
            features,
          }).onConflictDoNothing();
          result.imported++;
          break;
        }
        case 'templates': {
          await db.insert(schema.emailTemplates).values(data as typeof schema.emailTemplates.$inferInsert).onConflictDoNothing();
          result.imported++;
          break;
        }
        case 'notificationSettings': {
          await db.insert(schema.notificationSettings).values(data as typeof schema.notificationSettings.$inferInsert).onConflictDoNothing();
          result.imported++;
          break;
        }
        case 'appSettings': {
          const key = (data as { key: string }).key;
          const existing = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).get();
          if (existing) {
            await db.update(schema.appSettings).set(data as typeof schema.appSettings.$inferInsert).where(eq(schema.appSettings.key, key));
          } else {
            await db.insert(schema.appSettings).values(data as typeof schema.appSettings.$inferInsert);
          }
          result.imported++;
          break;
        }
        case 'mailHosting': {
          await db.insert(schema.mailHosting).values(data as typeof schema.mailHosting.$inferInsert).onConflictDoNothing();
          result.imported++;
          break;
        }
        default:
          result.skipped++;
      }
    } catch (error) {
      result.errors.push(`Row: ${JSON.stringify(item).substring(0, 100)}... - ${error instanceof Error ? error.message : 'Error'}`);
      result.skipped++;
    }
  }

  return result;
}

export default backup;
