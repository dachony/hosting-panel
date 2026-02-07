import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, and, lte, gte, isNull } from 'drizzle-orm';
import { authMiddleware, adminMiddleware, salesAdminWriteMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp, formatDate, addDaysToDate, daysUntilExpiry } from '../utils/dates.js';
import { parseId } from '../utils/validation.js';

const hosting = new Hono();

hosting.use('*', authMiddleware);

const hostingSchema = z.object({
  clientId: z.number().optional().nullable(),
  domainId: z.number({ required_error: 'Domain is required' }),
  packageId: z.number().optional().nullable(),
  startDate: z.string().optional().nullable(),
  expiryDate: z.string(),
  notes: z.string().optional().nullable(),
});

hosting.get('/', async (c) => {
  const allHosting = await db
    .select({
      id: schema.mailHosting.id,
      clientId: schema.mailHosting.clientId,
      domainId: schema.mailHosting.domainId,
      packageId: schema.mailHosting.mailPackageId,
      startDate: schema.mailHosting.startDate,
      expiryDate: schema.mailHosting.expiryDate,
      isActive: schema.mailHosting.isActive,
      notes: schema.mailHosting.notes,
      createdAt: schema.mailHosting.createdAt,
      clientName: schema.clients.name,
      clientContactPerson: schema.clients.contactPerson,
      clientPhone: schema.clients.phone,
      clientEmail: schema.clients.email1,
      clientTechContact: schema.clients.techContact,
      clientTechPhone: schema.clients.techPhone,
      clientTechEmail: schema.clients.techEmail,
      domainName: schema.domains.domainName,
      domainPrimaryName: schema.domains.primaryContactName,
      domainPrimaryPhone: schema.domains.primaryContactPhone,
      domainPrimaryEmail: schema.domains.primaryContactEmail,
      domainTechName: schema.domains.contactEmail1,
      domainTechPhone: schema.domains.contactEmail2,
      domainTechEmail: schema.domains.contactEmail3,
      domainIsActive: schema.domains.isActive,
      packageName: schema.mailPackages.name,
      packageDescription: schema.mailPackages.description,
      packageMaxMailboxes: schema.mailPackages.maxMailboxes,
      packageStorageGb: schema.mailPackages.storageGb,
      packagePrice: schema.mailPackages.price,
      mailServerName: schema.mailServers.name,
      mailSecurityName: schema.mailSecurity.name,
    })
    .from(schema.mailHosting)
    .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
    .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id))
    .leftJoin(schema.mailServers, eq(schema.mailPackages.mailServerId, schema.mailServers.id))
    .leftJoin(schema.mailSecurity, eq(schema.mailPackages.mailSecurityId, schema.mailSecurity.id));

  const hostingWithDays = allHosting.map(h => ({
    ...h,
    daysUntilExpiry: daysUntilExpiry(h.expiryDate),
  }));

  // Domains without any hosting record
  const unhostedDomains = await db
    .select({
      domainId: schema.domains.id,
      domainName: schema.domains.domainName,
      clientId: schema.domains.clientId,
      clientName: schema.clients.name,
      clientContactPerson: schema.clients.contactPerson,
      clientPhone: schema.clients.phone,
      clientEmail: schema.clients.email1,
      clientTechContact: schema.clients.techContact,
      clientTechPhone: schema.clients.techPhone,
      clientTechEmail: schema.clients.techEmail,
      domainPrimaryName: schema.domains.primaryContactName,
      domainPrimaryPhone: schema.domains.primaryContactPhone,
      domainPrimaryEmail: schema.domains.primaryContactEmail,
      domainTechName: schema.domains.contactEmail1,
      domainTechPhone: schema.domains.contactEmail2,
      domainTechEmail: schema.domains.contactEmail3,
      domainIsActive: schema.domains.isActive,
      notes: schema.domains.notes,
      createdAt: schema.domains.createdAt,
    })
    .from(schema.domains)
    .leftJoin(schema.mailHosting, eq(schema.domains.id, schema.mailHosting.domainId))
    .leftJoin(schema.clients, eq(schema.domains.clientId, schema.clients.id))
    .where(isNull(schema.mailHosting.id));

  const unhostedMapped = unhostedDomains.map(d => ({
    id: null as unknown as number,
    clientId: d.clientId,
    domainId: d.domainId,
    packageId: null,
    startDate: null,
    expiryDate: null as unknown as string,
    isActive: null as unknown as boolean,
    notes: d.notes,
    createdAt: d.createdAt,
    clientName: d.clientName,
    clientContactPerson: d.clientContactPerson,
    clientPhone: d.clientPhone,
    clientEmail: d.clientEmail,
    clientTechContact: d.clientTechContact,
    clientTechPhone: d.clientTechPhone,
    clientTechEmail: d.clientTechEmail,
    domainName: d.domainName,
    domainPrimaryName: d.domainPrimaryName,
    domainPrimaryPhone: d.domainPrimaryPhone,
    domainPrimaryEmail: d.domainPrimaryEmail,
    domainTechName: d.domainTechName,
    domainTechPhone: d.domainTechPhone,
    domainTechEmail: d.domainTechEmail,
    domainIsActive: d.domainIsActive,
    packageName: null,
    packageDescription: null,
    packageMaxMailboxes: null,
    packageStorageGb: null,
    packagePrice: null,
    mailServerName: null,
    mailSecurityName: null,
    daysUntilExpiry: null as unknown as number,
  }));

  return c.json({ hosting: [...hostingWithDays, ...unhostedMapped] });
});

hosting.get('/expiring', async (c) => {
  const days = parseInt(c.req.query('days') || '30');
  const today = formatDate(new Date());
  const futureDate = addDaysToDate(new Date(), days);

  const expiringHosting = await db
    .select({
      id: schema.mailHosting.id,
      clientId: schema.mailHosting.clientId,
      expiryDate: schema.mailHosting.expiryDate,
      clientName: schema.clients.name,
      domainName: schema.domains.domainName,
      packageName: schema.mailPackages.name,
    })
    .from(schema.mailHosting)
    .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
    .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id))
    .where(and(
      gte(schema.mailHosting.expiryDate, today),
      lte(schema.mailHosting.expiryDate, futureDate)
    ));

  const hostingWithDays = expiringHosting.map(h => ({
    ...h,
    daysUntilExpiry: daysUntilExpiry(h.expiryDate),
  }));

  return c.json({ hosting: hostingWithDays });
});

hosting.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid hosting ID' }, 400);

  const hostingItem = await db
    .select({
      id: schema.mailHosting.id,
      clientId: schema.mailHosting.clientId,
      domainId: schema.mailHosting.domainId,
      packageId: schema.mailHosting.mailPackageId,
      startDate: schema.mailHosting.startDate,
      expiryDate: schema.mailHosting.expiryDate,
      isActive: schema.mailHosting.isActive,
      notes: schema.mailHosting.notes,
      createdAt: schema.mailHosting.createdAt,
      clientName: schema.clients.name,
      domainName: schema.domains.domainName,
      packageName: schema.mailPackages.name,
    })
    .from(schema.mailHosting)
    .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
    .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id))
    .where(eq(schema.mailHosting.id, id))
    .get();

  if (!hostingItem) {
    return c.json({ error: 'Hosting not found' }, 404);
  }

  return c.json({
    hosting: {
      ...hostingItem,
      daysUntilExpiry: daysUntilExpiry(hostingItem.expiryDate),
    },
  });
});

hosting.post('/', salesAdminWriteMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = hostingSchema.parse(body);

    const [hostingItem] = await db.insert(schema.mailHosting).values({
      clientId: data.clientId,
      domainId: data.domainId,
      mailPackageId: data.packageId,
      startDate: data.startDate,
      expiryDate: data.expiryDate,
      notes: data.notes,
    }).returning();

    return c.json({ hosting: hostingItem }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

hosting.put('/:id', salesAdminWriteMiddleware, async (c) => {
  try {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid hosting ID' }, 400);
    const body = await c.req.json();
    const data = hostingSchema.partial().parse(body);

    const existing = await db.select().from(schema.mailHosting).where(eq(schema.mailHosting.id, id)).get();
    if (!existing) {
      return c.json({ error: 'Hosting not found' }, 404);
    }

    const updateData: Record<string, unknown> = { updatedAt: getCurrentTimestamp() };
    if (data.clientId !== undefined) updateData.clientId = data.clientId;
    if (data.domainId !== undefined) updateData.domainId = data.domainId;
    if (data.packageId !== undefined) updateData.mailPackageId = data.packageId;
    if (data.startDate !== undefined) updateData.startDate = data.startDate;
    if (data.expiryDate !== undefined) updateData.expiryDate = data.expiryDate;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const [hostingItem] = await db.update(schema.mailHosting)
      .set(updateData)
      .where(eq(schema.mailHosting.id, id))
      .returning();

    return c.json({ hosting: hostingItem });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

hosting.delete('/:id', adminMiddleware, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid hosting ID' }, 400);

  const existing = await db.select().from(schema.mailHosting).where(eq(schema.mailHosting.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Hosting not found' }, 404);
  }

  await db.delete(schema.mailHosting).where(eq(schema.mailHosting.id, id));

  return c.json({ message: 'Hosting deleted' });
});

hosting.post('/:id/toggle', adminMiddleware, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid hosting ID' }, 400);

  const existing = await db.select().from(schema.mailHosting).where(eq(schema.mailHosting.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Hosting not found' }, 404);
  }

  const [updated] = await db.update(schema.mailHosting)
    .set({
      isActive: !existing.isActive,
      updatedAt: getCurrentTimestamp(),
    })
    .where(eq(schema.mailHosting.id, id))
    .returning();

  return c.json({ hosting: updated });
});

// Extend hosting expiry
const extendSchema = z.object({
  period: z.enum(['1month', '1year', '2years', '3years', 'unlimited']),
  fromToday: z.boolean().optional(),
});

hosting.post('/:id/extend', async (c) => {
  try {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid hosting ID' }, 400);
    const body = await c.req.json();
    const { period, fromToday } = extendSchema.parse(body);

    const daysToAdd: Record<string, number> = {
      '1month': 30,
      '1year': 365,
      '2years': 730,
      '3years': 365 * 3,
      'unlimited': 36500,
    };

    const existing = await db.select().from(schema.mailHosting).where(eq(schema.mailHosting.id, id)).get();
    if (!existing) return c.json({ error: 'Hosting not found' }, 404);

    let baseDate: string;
    if (fromToday) {
      baseDate = formatDate(new Date());
    } else {
      const currentExpiryDays = daysUntilExpiry(existing.expiryDate);
      baseDate = currentExpiryDays > 0 ? existing.expiryDate : formatDate(new Date());
    }
    const newExpiryDate = addDaysToDate(baseDate, daysToAdd[period]);

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

// Set expiry to yesterday
hosting.post('/:id/expire-now', adminMiddleware, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid hosting ID' }, 400);

  const existing = await db.select().from(schema.mailHosting).where(eq(schema.mailHosting.id, id)).get();
  if (!existing) return c.json({ error: 'Hosting not found' }, 404);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const newExpiryDate = formatDate(yesterday);

  await db.update(schema.mailHosting)
    .set({ expiryDate: newExpiryDate, updatedAt: getCurrentTimestamp() })
    .where(eq(schema.mailHosting.id, id));

  return c.json({ message: 'Hosting expired', newExpiryDate });
});

export default hosting;
