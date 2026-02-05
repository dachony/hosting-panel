import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, and, lte, gte } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp, formatDate, addDaysToDate, daysUntilExpiry } from '../utils/dates.js';

const mailHosting = new Hono();

mailHosting.use('*', authMiddleware);

const mailHostingSchema = z.object({
  clientId: z.number().optional().nullable(),
  domainId: z.number().optional().nullable(),
  mailPackageId: z.number().optional().nullable(),
  startDate: z.string().optional().nullable(),
  expiryDate: z.string(),
  mailboxesCount: z.number().int().min(1).default(1),
  notes: z.string().optional().nullable(),
});

mailHosting.get('/', async (c) => {
  const allMailHosting = await db
    .select({
      id: schema.mailHosting.id,
      clientId: schema.mailHosting.clientId,
      domainId: schema.mailHosting.domainId,
      mailPackageId: schema.mailHosting.mailPackageId,
      startDate: schema.mailHosting.startDate,
      expiryDate: schema.mailHosting.expiryDate,
      mailboxesCount: schema.mailHosting.mailboxesCount,
      notes: schema.mailHosting.notes,
      createdAt: schema.mailHosting.createdAt,
      clientName: schema.clients.name,
      domainName: schema.domains.domainName,
      packageName: schema.mailPackages.name,
    })
    .from(schema.mailHosting)
    .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
    .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id));

  const mailHostingWithDays = allMailHosting.map(m => ({
    ...m,
    daysUntilExpiry: daysUntilExpiry(m.expiryDate),
  }));

  return c.json({ mailHosting: mailHostingWithDays });
});

mailHosting.get('/expiring', async (c) => {
  const days = parseInt(c.req.query('days') || '30');
  const today = formatDate(new Date());
  const futureDate = addDaysToDate(new Date(), days);

  const expiringMailHosting = await db
    .select({
      id: schema.mailHosting.id,
      clientId: schema.mailHosting.clientId,
      expiryDate: schema.mailHosting.expiryDate,
      clientName: schema.clients.name,
      clientEmail: schema.clients.email1,
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

  const mailHostingWithDays = expiringMailHosting.map(m => ({
    ...m,
    daysUntilExpiry: daysUntilExpiry(m.expiryDate),
  }));

  return c.json({ mailHosting: mailHostingWithDays });
});

mailHosting.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  const mailHostingItem = await db
    .select({
      id: schema.mailHosting.id,
      clientId: schema.mailHosting.clientId,
      domainId: schema.mailHosting.domainId,
      mailPackageId: schema.mailHosting.mailPackageId,
      startDate: schema.mailHosting.startDate,
      expiryDate: schema.mailHosting.expiryDate,
      mailboxesCount: schema.mailHosting.mailboxesCount,
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

  if (!mailHostingItem) {
    return c.json({ error: 'Mail hosting not found' }, 404);
  }

  return c.json({
    mailHosting: {
      ...mailHostingItem,
      daysUntilExpiry: daysUntilExpiry(mailHostingItem.expiryDate),
    },
  });
});

mailHosting.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const data = mailHostingSchema.parse(body);

    const [mailHostingItem] = await db.insert(schema.mailHosting).values(data).returning();

    return c.json({ mailHosting: mailHostingItem }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

mailHosting.put('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = mailHostingSchema.partial().parse(body);

    const existing = await db.select().from(schema.mailHosting).where(eq(schema.mailHosting.id, id)).get();
    if (!existing) {
      return c.json({ error: 'Mail hosting not found' }, 404);
    }

    const [mailHostingItem] = await db.update(schema.mailHosting)
      .set({ ...data, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.mailHosting.id, id))
      .returning();

    return c.json({ mailHosting: mailHostingItem });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

mailHosting.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.mailHosting).where(eq(schema.mailHosting.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Mail hosting not found' }, 404);
  }

  await db.delete(schema.mailHosting).where(eq(schema.mailHosting.id, id));

  return c.json({ message: 'Mail hosting deleted' });
});

export default mailHosting;
