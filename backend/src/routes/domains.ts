import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, superAdminMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp } from '../utils/dates.js';

const domains = new Hono();

domains.use('*', authMiddleware);

const domainSchema = z.object({
  clientId: z.number().optional().nullable(),
  domainName: z.string().min(1),
  // Primary contact
  primaryContactName: z.string().optional().nullable(),
  primaryContactPhone: z.string().optional().nullable(),
  primaryContactEmail: z.string().optional().nullable(),
  // Technical contact (contactEmail1 = name, contactEmail2 = phone, contactEmail3 = email)
  contactEmail1: z.string().optional().nullable(),
  contactEmail2: z.string().optional().nullable(),
  contactEmail3: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

domains.get('/', async (c) => {
  const allDomains = await db
    .select({
      id: schema.domains.id,
      clientId: schema.domains.clientId,
      domainName: schema.domains.domainName,
      primaryContactName: schema.domains.primaryContactName,
      primaryContactPhone: schema.domains.primaryContactPhone,
      primaryContactEmail: schema.domains.primaryContactEmail,
      contactEmail1: schema.domains.contactEmail1,
      contactEmail2: schema.domains.contactEmail2,
      contactEmail3: schema.domains.contactEmail3,
      notes: schema.domains.notes,
      createdAt: schema.domains.createdAt,
      clientName: schema.clients.name,
    })
    .from(schema.domains)
    .leftJoin(schema.clients, eq(schema.domains.clientId, schema.clients.id));

  return c.json({ domains: allDomains });
});

domains.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  const domain = await db
    .select({
      id: schema.domains.id,
      clientId: schema.domains.clientId,
      domainName: schema.domains.domainName,
      primaryContactName: schema.domains.primaryContactName,
      primaryContactPhone: schema.domains.primaryContactPhone,
      primaryContactEmail: schema.domains.primaryContactEmail,
      contactEmail1: schema.domains.contactEmail1,
      contactEmail2: schema.domains.contactEmail2,
      contactEmail3: schema.domains.contactEmail3,
      notes: schema.domains.notes,
      createdAt: schema.domains.createdAt,
      clientName: schema.clients.name,
    })
    .from(schema.domains)
    .leftJoin(schema.clients, eq(schema.domains.clientId, schema.clients.id))
    .where(eq(schema.domains.id, id))
    .get();

  if (!domain) {
    return c.json({ error: 'Domain not found' }, 404);
  }

  return c.json({ domain });
});

domains.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const data = domainSchema.parse(body);

    const existing = await db.select().from(schema.domains).where(eq(schema.domains.domainName, data.domainName)).get();
    if (existing) {
      return c.json({ error: 'Domain already exists' }, 400);
    }

    const [domain] = await db.insert(schema.domains).values(data).returning();

    return c.json({ domain }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

domains.put('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = domainSchema.partial().parse(body);

    const existing = await db.select().from(schema.domains).where(eq(schema.domains.id, id)).get();
    if (!existing) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    if (data.domainName && data.domainName !== existing.domainName) {
      const duplicate = await db.select().from(schema.domains).where(eq(schema.domains.domainName, data.domainName)).get();
      if (duplicate) {
        return c.json({ error: 'Domain name already exists' }, 400);
      }
    }

    const [domain] = await db.update(schema.domains)
      .set({ ...data, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.domains.id, id))
      .returning();

    return c.json({ domain });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

domains.delete('/:id', superAdminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.domains).where(eq(schema.domains.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Domain not found' }, 404);
  }

  await db.delete(schema.domains).where(eq(schema.domains.id, id));

  return c.json({ message: 'Domain deleted' });
});

export default domains;
