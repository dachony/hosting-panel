import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, superAdminMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp, daysUntilExpiry, addDaysToDate, formatDate } from '../utils/dates.js';
import { audit } from '../services/audit.js';
import { parseId } from '../utils/validation.js';

const clients = new Hono();

clients.use('*', authMiddleware);

const clientSchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional().nullable(),
  contactPerson: z.string().min(1),
  phone: z.string().optional().nullable(),
  email1: z.string().email().min(1),
  email2: z.string().email().optional().nullable(),
  email3: z.string().email().optional().nullable(),
  techContact: z.string().optional().nullable(),
  techPhone: z.string().optional().nullable(),
  techEmail: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  pib: z.string().optional().nullable(),
  mib: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Helper to calculate expiry status
function getExpiryStatus(days: number): 'green' | 'yellow' | 'orange' | 'red' {
  if (days <= 0) return 'red';
  if (days <= 7) return 'orange';
  if (days <= 31) return 'yellow';
  return 'green';
}

clients.get('/', async (c) => {
  const allClients = await db.select().from(schema.clients);

  // Get earliest hosting expiry for each client
  const clientsWithExpiry = await Promise.all(allClients.map(async (client) => {
    const hosting = await db.select().from(schema.mailHosting).where(eq(schema.mailHosting.clientId, client.id));

    // Find earliest expiry date from hosting only
    let earliestExpiry: string | null = null;
    let earliestDays: number | null = null;

    hosting.forEach((item) => {
      const days = daysUntilExpiry(item.expiryDate);
      if (earliestDays === null || days < earliestDays) {
        earliestDays = days;
        earliestExpiry = item.expiryDate;
      }
    });

    return {
      ...client,
      earliestExpiryDate: earliestExpiry,
      daysUntilExpiry: earliestDays,
      expiryStatus: earliestDays !== null ? getExpiryStatus(earliestDays) : null,
    };
  }));

  return c.json({ clients: clientsWithExpiry });
});

clients.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid client ID' }, 400);
  const client = await db.select().from(schema.clients).where(eq(schema.clients.id, id)).get();

  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  // Get related domains and hosting with expiry info
  const domains = await db.select().from(schema.domains).where(eq(schema.domains.clientId, id));
  const hosting = await db
    .select({
      id: schema.mailHosting.id,
      clientId: schema.mailHosting.clientId,
      domainId: schema.mailHosting.domainId,
      packageId: schema.mailHosting.mailPackageId,
      startDate: schema.mailHosting.startDate,
      expiryDate: schema.mailHosting.expiryDate,
      notes: schema.mailHosting.notes,
      createdAt: schema.mailHosting.createdAt,
      packageName: schema.mailPackages.name,
      packageDescription: schema.mailPackages.description,
      packageMaxMailboxes: schema.mailPackages.maxMailboxes,
      packageStorageGb: schema.mailPackages.storageGb,
      mailServerName: schema.mailServers.name,
      mailSecurityName: schema.mailSecurity.name,
    })
    .from(schema.mailHosting)
    .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id))
    .leftJoin(schema.mailServers, eq(schema.mailPackages.mailServerId, schema.mailServers.id))
    .leftJoin(schema.mailSecurity, eq(schema.mailPackages.mailSecurityId, schema.mailSecurity.id))
    .where(eq(schema.mailHosting.clientId, id));

  const hostingWithStatus = hosting.map(h => ({
    ...h,
    daysUntilExpiry: daysUntilExpiry(h.expiryDate),
    expiryStatus: getExpiryStatus(daysUntilExpiry(h.expiryDate)),
  }));

  return c.json({
    client,
    domains,
    hosting: hostingWithStatus,
  });
});

clients.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const data = clientSchema.parse(body);

    const [client] = await db.insert(schema.clients).values(data).returning();

    await audit.create(c, 'client', client.id, client.name);

    return c.json({ client }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

clients.put('/:id', async (c) => {
  try {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid client ID' }, 400);
    const body = await c.req.json();
    const data = clientSchema.partial().parse(body);

    const existing = await db.select().from(schema.clients).where(eq(schema.clients.id, id)).get();
    if (!existing) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const [client] = await db.update(schema.clients)
      .set({ ...data, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.clients.id, id))
      .returning();

    await audit.update(c, 'client', client.id, client.name);

    return c.json({ client });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

clients.delete('/:id', superAdminMiddleware, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid client ID' }, 400);

  const existing = await db.select().from(schema.clients).where(eq(schema.clients.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Client not found' }, 404);
  }

  await db.delete(schema.clients).where(eq(schema.clients.id, id));

  await audit.delete(c, 'client', id, existing.name);

  return c.json({ message: 'Client deleted' });
});

// Extend hosting endpoint
const extendSchema = z.object({
  id: z.number(),
  period: z.enum(['1month', '1year', '2years', '3years', 'unlimited']),
  fromToday: z.boolean().optional(),
});

clients.post('/:clientId/extend', async (c) => {
  try {
    const body = await c.req.json();
    const { id, period, fromToday } = extendSchema.parse(body);

    // Calculate days to add
    const daysToAdd = {
      '1month': 30,
      '1year': 365,
      '2years': 730,
      '3years': 365 * 3,
      'unlimited': 36500, // 100 years
    }[period];

    const hosting = await db.select().from(schema.mailHosting).where(eq(schema.mailHosting.id, id)).get();
    if (!hosting) return c.json({ error: 'Hosting not found' }, 404);

    // Determine base date: fromToday=true uses today, otherwise use expiry date (or today if expired)
    let baseDate: string;
    if (fromToday) {
      baseDate = formatDate(new Date());
    } else {
      const currentExpiryDays = daysUntilExpiry(hosting.expiryDate);
      baseDate = currentExpiryDays > 0 ? hosting.expiryDate : formatDate(new Date());
    }
    const newExpiryDate = addDaysToDate(baseDate, daysToAdd);

    await db.update(schema.mailHosting)
      .set({ expiryDate: newExpiryDate, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.mailHosting.id, id));

    return c.json({ message: 'Hosting extended', newExpiryDate });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

export default clients;
