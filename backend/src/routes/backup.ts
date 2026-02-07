import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { authMiddleware, adminMiddleware, superAdminMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { getCurrentTimestamp } from '../utils/dates.js';
import { getExportData, createServerBackup, getBackupFiles, cleanupOldBackups, BACKUP_DIR } from '../services/backupService.js';

const backup = new Hono();

backup.use('*', authMiddleware, adminMiddleware);

// Types of data that can be exported/imported
type ExportType = 'clients' | 'domains' | 'hosting' | 'packages' | 'templates' | 'scheduler' | 'settings' | 'users';

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

  let data: Record<string, unknown>;

  if (exportAll) {
    data = await getExportData();
  } else {
    const partial: Record<string, unknown[]> = {};

    if (types.includes('clients')) {
      partial.clients = await db.select().from(schema.clients);
    }
    if (types.includes('domains')) {
      partial.domains = await db.select().from(schema.domains);
    }
    if (types.includes('hosting')) {
      const [webHosting, mailHosting] = await Promise.all([
        db.select().from(schema.webHosting),
        db.select().from(schema.mailHosting),
      ]);
      partial.webHosting = webHosting;
      partial.mailHosting = mailHosting;
    }
    if (types.includes('packages')) {
      const [mailPackages, mailServers, mailSecurity] = await Promise.all([
        db.select().from(schema.mailPackages),
        db.select().from(schema.mailServers),
        db.select().from(schema.mailSecurity),
      ]);
      partial.packages = mailPackages;
      partial.mailServers = mailServers;
      partial.mailSecurity = mailSecurity;
    }
    if (types.includes('templates')) {
      partial.templates = await db.select().from(schema.emailTemplates);
    }
    if (types.includes('scheduler')) {
      const [notifications, reports] = await Promise.all([
        db.select().from(schema.notificationSettings),
        db.select().from(schema.reportSettings),
      ]);
      partial.notificationSettings = notifications;
      partial.reportSettings = reports;
    }
    if (types.includes('users')) {
      const [users, backupCodes] = await Promise.all([
        db.select().from(schema.users),
        db.select().from(schema.backupCodes),
      ]);
      partial.users = users;
      partial.backupCodes = backupCodes;
    }
    if (types.includes('settings')) {
      const [appSettings, companyInfo, bankAccounts] = await Promise.all([
        db.select().from(schema.appSettings),
        db.select().from(schema.companyInfo),
        db.select().from(schema.bankAccounts),
      ]);
      partial.appSettings = appSettings;
      partial.companyInfo = companyInfo;
      partial.bankAccounts = bankAccounts;
    }
    data = partial;
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
backup.post('/validate', superAdminMiddleware, async (c) => {
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
  overwrite: z.boolean().optional(),
  data: z.any(),
});

backup.post('/import', superAdminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const importData = importSchemaV2.parse(body);

    const results: Record<string, { imported: number; skipped: number; overwritten: number; errors: string[] }> = {};
    const overwrite = importData.overwrite ?? false;

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

      results[type] = await importItems(type, items, undefined, overwrite);
    } else if (importData.data && typeof importData.data === 'object') {
      // Handle full backup import (JSON with multiple types)
      const data = importData.data as Record<string, unknown[]>;

      // Users first (backupCodes depend on them)
      if (data.users) {
        results.users = await importItems('users', data.users as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.backupCodes) {
        results.backupCodes = await importItems('backupCodes', data.backupCodes as Record<string, unknown>[], data.users as Record<string, unknown>[] | undefined, overwrite);
      }
      if (data.clients) {
        results.clients = await importItems('clients', data.clients as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.domains) {
        results.domains = await importItems('domains', data.domains as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.packages) {
        results.packages = await importItems('packages', data.packages as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.webHosting) {
        results.webHosting = await importItems('hosting', data.webHosting as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.mailHosting) {
        results.mailHosting = await importItems('mailHosting', data.mailHosting as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.templates) {
        results.templates = await importItems('templates', data.templates as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.notificationSettings) {
        results.notificationSettings = await importItems('notificationSettings', data.notificationSettings as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.appSettings) {
        results.appSettings = await importItems('appSettings', data.appSettings as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.mailServers) {
        results.mailServers = await importItems('mailServers', data.mailServers as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.mailSecurity) {
        results.mailSecurity = await importItems('mailSecurity', data.mailSecurity as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.companyInfo) {
        results.companyInfo = await importItems('companyInfo', data.companyInfo as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.bankAccounts) {
        results.bankAccounts = await importItems('bankAccounts', data.bankAccounts as Record<string, unknown>[], undefined, overwrite);
      }
      if (data.reportSettings) {
        results.reportSettings = await importItems('reportSettings', data.reportSettings as Record<string, unknown>[], undefined, overwrite);
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
async function importItems(type: string, items: Record<string, unknown>[], extraContext?: Record<string, unknown>[], overwrite: boolean = false): Promise<{ imported: number; skipped: number; overwritten: number; errors: string[] }> {
  const result = { imported: 0, skipped: 0, overwritten: 0, errors: [] as string[] };

  for (const item of items) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, updatedAt, ...data } = item;

      switch (type) {
        case 'clients': {
          const validated = clientSchema.parse(data);
          const existing = await db.select().from(schema.clients).where(eq(schema.clients.name, validated.name)).get();
          if (existing) {
            if (overwrite) {
              await db.update(schema.clients).set(validated as typeof schema.clients.$inferInsert).where(eq(schema.clients.id, existing.id));
              result.overwritten++;
            } else {
              result.skipped++;
            }
            break;
          }
          await db.insert(schema.clients).values(validated as typeof schema.clients.$inferInsert);
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
          const existingDomain = await db.select().from(schema.domains).where(eq(schema.domains.domainName, validated.domainName)).get();
          if (existingDomain) {
            if (overwrite) {
              await db.update(schema.domains).set(validated as typeof schema.domains.$inferInsert).where(eq(schema.domains.id, existingDomain.id));
              result.overwritten++;
            } else {
              result.skipped++;
            }
            break;
          }
          await db.insert(schema.domains).values(validated as typeof schema.domains.$inferInsert);
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
          if ((validated as { domainId?: number }).domainId) {
            const existingHosting = await db.select().from(schema.webHosting).where(eq(schema.webHosting.domainId, (validated as { domainId: number }).domainId)).get();
            if (existingHosting) {
              if (overwrite) {
                await db.update(schema.webHosting).set(validated as typeof schema.webHosting.$inferInsert).where(eq(schema.webHosting.id, existingHosting.id));
                result.overwritten++;
              } else {
                result.skipped++;
              }
              break;
            }
          }
          await db.insert(schema.webHosting).values(validated as typeof schema.webHosting.$inferInsert);
          result.imported++;
          break;
        }
        case 'packages': {
          const validated = packageSchema.parse(data);
          const existingPkg = await db.select().from(schema.mailPackages).where(eq(schema.mailPackages.name, validated.name)).get();
          if (existingPkg) {
            if (overwrite) {
              const features = validated.features ? validated.features.split('|') : null;
              await db.update(schema.mailPackages).set({
                name: validated.name,
                description: validated.description,
                maxMailboxes: validated.maxMailboxes,
                storageGb: validated.storageGb,
                price: validated.price,
                features,
              }).where(eq(schema.mailPackages.id, existingPkg.id));
              result.overwritten++;
            } else {
              result.skipped++;
            }
            break;
          }
          const features = validated.features ? validated.features.split('|') : null;
          await db.insert(schema.mailPackages).values({
            name: validated.name,
            description: validated.description,
            maxMailboxes: validated.maxMailboxes,
            storageGb: validated.storageGb,
            price: validated.price,
            features,
          });
          result.imported++;
          break;
        }
        case 'templates': {
          const tplName = (data as { name?: string }).name;
          if (tplName) {
            const existing = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.name, tplName)).get();
            if (existing) {
              if (overwrite) {
                await db.update(schema.emailTemplates).set(data as typeof schema.emailTemplates.$inferInsert).where(eq(schema.emailTemplates.id, existing.id));
                result.overwritten++;
              } else {
                result.skipped++;
              }
              break;
            }
          }
          await db.insert(schema.emailTemplates).values(data as typeof schema.emailTemplates.$inferInsert);
          result.imported++;
          break;
        }
        case 'notificationSettings': {
          const nsName = (data as { name?: string }).name;
          if (nsName) {
            const existing = await db.select().from(schema.notificationSettings).where(eq(schema.notificationSettings.name, nsName)).get();
            if (existing) {
              if (overwrite) {
                await db.update(schema.notificationSettings).set(data as typeof schema.notificationSettings.$inferInsert).where(eq(schema.notificationSettings.id, existing.id));
                result.overwritten++;
              } else {
                result.skipped++;
              }
              break;
            }
          }
          await db.insert(schema.notificationSettings).values(data as typeof schema.notificationSettings.$inferInsert);
          result.imported++;
          break;
        }
        case 'appSettings': {
          const key = (data as { key: string }).key;
          const existing = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).get();
          if (existing) {
            await db.update(schema.appSettings).set(data as typeof schema.appSettings.$inferInsert).where(eq(schema.appSettings.key, key));
            result.overwritten++;
          } else {
            await db.insert(schema.appSettings).values(data as typeof schema.appSettings.$inferInsert);
            result.imported++;
          }
          break;
        }
        case 'mailHosting': {
          const mhDomainId = (data as { domainId?: number }).domainId;
          if (mhDomainId) {
            const existing = await db.select().from(schema.mailHosting).where(eq(schema.mailHosting.domainId, mhDomainId)).get();
            if (existing) {
              if (overwrite) {
                await db.update(schema.mailHosting).set(data as typeof schema.mailHosting.$inferInsert).where(eq(schema.mailHosting.id, existing.id));
                result.overwritten++;
              } else {
                result.skipped++;
              }
              break;
            }
          }
          await db.insert(schema.mailHosting).values(data as typeof schema.mailHosting.$inferInsert);
          result.imported++;
          break;
        }
        case 'mailServers': {
          const msName = (data as { name?: string }).name;
          if (msName) {
            const existing = await db.select().from(schema.mailServers).where(eq(schema.mailServers.name, msName)).get();
            if (existing) {
              if (overwrite) {
                await db.update(schema.mailServers).set(data as typeof schema.mailServers.$inferInsert).where(eq(schema.mailServers.id, existing.id));
                result.overwritten++;
              } else {
                result.skipped++;
              }
              break;
            }
          }
          await db.insert(schema.mailServers).values(data as typeof schema.mailServers.$inferInsert);
          result.imported++;
          break;
        }
        case 'mailSecurity': {
          const mscName = (data as { name?: string }).name;
          if (mscName) {
            const existing = await db.select().from(schema.mailSecurity).where(eq(schema.mailSecurity.name, mscName)).get();
            if (existing) {
              if (overwrite) {
                await db.update(schema.mailSecurity).set(data as typeof schema.mailSecurity.$inferInsert).where(eq(schema.mailSecurity.id, existing.id));
                result.overwritten++;
              } else {
                result.skipped++;
              }
              break;
            }
          }
          await db.insert(schema.mailSecurity).values(data as typeof schema.mailSecurity.$inferInsert);
          result.imported++;
          break;
        }
        case 'companyInfo': {
          const ciName = (data as { name?: string }).name;
          if (ciName) {
            const existing = await db.select().from(schema.companyInfo).where(eq(schema.companyInfo.name, ciName)).get();
            if (existing) {
              if (overwrite) {
                await db.update(schema.companyInfo).set(data as typeof schema.companyInfo.$inferInsert).where(eq(schema.companyInfo.id, existing.id));
                result.overwritten++;
              } else {
                result.skipped++;
              }
              break;
            }
          }
          await db.insert(schema.companyInfo).values(data as typeof schema.companyInfo.$inferInsert);
          result.imported++;
          break;
        }
        case 'bankAccounts': {
          const baName = (data as { bankName?: string }).bankName;
          if (baName) {
            const existing = await db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.bankName, baName)).get();
            if (existing) {
              if (overwrite) {
                await db.update(schema.bankAccounts).set(data as typeof schema.bankAccounts.$inferInsert).where(eq(schema.bankAccounts.id, existing.id));
                result.overwritten++;
              } else {
                result.skipped++;
              }
              break;
            }
          }
          await db.insert(schema.bankAccounts).values(data as typeof schema.bankAccounts.$inferInsert);
          result.imported++;
          break;
        }
        case 'reportSettings': {
          await db.insert(schema.reportSettings).values(data as typeof schema.reportSettings.$inferInsert).onConflictDoNothing();
          result.imported++;
          break;
        }
        case 'users': {
          const email = (data as { email?: string }).email;
          if (!email) { result.skipped++; break; }
          const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
          if (existing) {
            if (overwrite) {
              // Do NOT overwrite password
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { password, ...dataWithoutPassword } = data as Record<string, unknown>;
              await db.update(schema.users).set(dataWithoutPassword as typeof schema.users.$inferInsert).where(eq(schema.users.id, existing.id));
              result.overwritten++;
            } else {
              result.skipped++;
            }
            break;
          }
          await db.insert(schema.users).values(data as typeof schema.users.$inferInsert);
          result.imported++;
          break;
        }
        case 'backupCodes': {
          // Resolve userId: find original user email from exported users, then lookup by email in DB
          const origUserId = (item as { userId?: number }).userId;
          if (!origUserId) { result.skipped++; break; }
          const exportedUsers = extraContext || [];
          const origUser = exportedUsers.find((u: Record<string, unknown>) => u.id === origUserId) as { email?: string } | undefined;
          if (!origUser?.email) { result.skipped++; break; }
          const dbUser = await db.select().from(schema.users).where(eq(schema.users.email, origUser.email)).get();
          if (!dbUser) { result.skipped++; break; }
          await db.insert(schema.backupCodes).values({
            userId: dbUser.id,
            code: (data as { code: string }).code,
            usedAt: (data as { usedAt?: string | null }).usedAt || null,
          });
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

// ==========================================
// Server-side Backup Management Endpoints
// ==========================================

// Backup settings schema
const backupSettingsSchema = z.object({
  schedule: z.object({
    enabled: z.boolean(),
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    dayOfWeek: z.number().min(0).max(6).optional(),
    dayOfMonth: z.number().min(1).max(31).optional(),
  }),
  password: z.string().optional().default(''),
  notifications: z.object({
    enabled: z.boolean(),
    email: z.string().email().or(z.literal('')),
  }),
  retention: z.object({
    enabled: z.boolean(),
    days: z.number().min(1).max(365),
  }),
});

// Create a server-side backup
backup.post('/create', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const password = typeof body.password === 'string' && body.password.length > 0 ? body.password : undefined;
    const result = await createServerBackup(password);
    return c.json(result);
  } catch (error) {
    console.error('Backup creation error:', error);
    return c.json({ error: 'Failed to create backup' }, 500);
  }
});

// List backup files
backup.get('/files', async (c) => {
  try {
    const result = getBackupFiles();
    return c.json(result);
  } catch (error) {
    console.error('Backup list error:', error);
    return c.json({ error: 'Failed to list backups' }, 500);
  }
});

// Get backup settings
backup.get('/settings', async (c) => {
  const setting = await db.select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, 'backupSchedule'))
    .get();

  const defaults = {
    schedule: { enabled: false, frequency: 'daily' as const, time: '02:00' },
    password: '',
    notifications: { enabled: false, email: '' },
    retention: { enabled: false, days: 30 },
  };

  if (setting?.value) {
    return c.json({ settings: { ...defaults, ...(setting.value as object) } });
  }
  return c.json({ settings: defaults });
});

// Save backup settings
backup.put('/settings', async (c) => {
  try {
    const body = await c.req.json();
    const data = backupSettingsSchema.parse(body);

    const existing = await db.select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, 'backupSchedule'))
      .get();

    if (existing) {
      await db.update(schema.appSettings)
        .set({ value: data, updatedAt: getCurrentTimestamp() })
        .where(eq(schema.appSettings.key, 'backupSchedule'));
    } else {
      await db.insert(schema.appSettings).values({ key: 'backupSchedule', value: data });
    }

    return c.json({ settings: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid settings', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to save settings' }, 500);
  }
});

// Cleanup old backups (must be before :filename route)
backup.delete('/files/cleanup', async (c) => {
  try {
    const olderThan = c.req.query('olderThan') || '30d';
    const match = olderThan.match(/^(\d+)d$/);
    if (!match) {
      return c.json({ error: 'Invalid olderThan format. Use Nd (e.g., 3d, 7d, 30d)' }, 400);
    }
    const days = parseInt(match[1]);
    if (days < 1) {
      return c.json({ error: 'Days must be at least 1' }, 400);
    }
    const deleted = cleanupOldBackups(days);
    return c.json({ deleted });
  } catch (error) {
    console.error('Backup cleanup error:', error);
    return c.json({ error: 'Failed to cleanup backups' }, 500);
  }
});

// Download a backup file
backup.get('/files/:filename/download', async (c) => {
  try {
    const filename = c.req.param('filename');

    // Path traversal protection
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: 'Invalid filename' }, 400);
    }

    const filePath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: 'Backup file not found' }, 404);
    }

    const fileContent = fs.readFileSync(filePath);
    const contentType = filename.endsWith('.zip') ? 'application/zip' : 'application/json';
    c.header('Content-Type', contentType);
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.body(fileContent);
  } catch (error) {
    console.error('Backup download error:', error);
    return c.json({ error: 'Failed to download backup' }, 500);
  }
});

// Delete a single backup file
backup.delete('/files/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');

    // Path traversal protection
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: 'Invalid filename' }, 400);
    }

    const filePath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: 'Backup file not found' }, 404);
    }

    fs.unlinkSync(filePath);
    return c.json({ message: 'Backup deleted' });
  } catch (error) {
    console.error('Backup delete error:', error);
    return c.json({ error: 'Failed to delete backup' }, 500);
  }
});

export default backup;
