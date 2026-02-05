import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, and, lte, gte } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp, formatDate, addDaysToDate, daysUntilExpiry } from '../utils/dates.js';

const hosting = new Hono();

hosting.use('*', authMiddleware);

const hostingSchema = z.object({
  clientId: z.number().optional().nullable(),
  domainId: z.number().optional().nullable(),
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
      domainTechName: schema.domains.contactEmail1,
      domainTechPhone: schema.domains.contactEmail2,
      domainTechEmail: schema.domains.contactEmail3,
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

  return c.json({ hosting: hostingWithDays });
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
  const id = parseInt(c.req.param('id'));

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

hosting.post('/', async (c) => {
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

hosting.put('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
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

hosting.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.mailHosting).where(eq(schema.mailHosting.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Hosting not found' }, 404);
  }

  await db.delete(schema.mailHosting).where(eq(schema.mailHosting.id, id));

  return c.json({ message: 'Hosting deleted' });
});

hosting.post('/:id/toggle', async (c) => {
  const id = parseInt(c.req.param('id'));

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

export default hosting;
