import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp } from '../utils/dates.js';

const mailSecurity = new Hono();

mailSecurity.use('*', authMiddleware);

const mailSecuritySchema = z.object({
  name: z.string().min(1),
  hostname: z.string().min(1),
  description: z.string().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
});

mailSecurity.get('/', async (c) => {
  const services = await db.select().from(schema.mailSecurity);
  return c.json({ services });
});

mailSecurity.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const service = await db.select().from(schema.mailSecurity).where(eq(schema.mailSecurity.id, id)).get();

  if (!service) {
    return c.json({ error: 'Mail security service not found' }, 404);
  }

  return c.json({ service });
});

mailSecurity.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const data = mailSecuritySchema.parse(body);

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await db.update(schema.mailSecurity)
        .set({ isDefault: false, updatedAt: getCurrentTimestamp() })
        .where(eq(schema.mailSecurity.isDefault, true));
    }

    const [service] = await db.insert(schema.mailSecurity).values(data).returning();

    return c.json({ service }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

mailSecurity.put('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = mailSecuritySchema.partial().parse(body);

    const existing = await db.select().from(schema.mailSecurity).where(eq(schema.mailSecurity.id, id)).get();
    if (!existing) {
      return c.json({ error: 'Mail security service not found' }, 404);
    }

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await db.update(schema.mailSecurity)
        .set({ isDefault: false, updatedAt: getCurrentTimestamp() })
        .where(eq(schema.mailSecurity.isDefault, true));
    }

    const [service] = await db.update(schema.mailSecurity)
      .set({ ...data, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.mailSecurity.id, id))
      .returning();

    return c.json({ service });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

mailSecurity.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.mailSecurity).where(eq(schema.mailSecurity.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Mail security service not found' }, 404);
  }

  await db.delete(schema.mailSecurity).where(eq(schema.mailSecurity.id, id));

  return c.json({ message: 'Mail security service deleted' });
});

mailSecurity.post('/:id/set-default', async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.mailSecurity).where(eq(schema.mailSecurity.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Mail security service not found' }, 404);
  }

  // Unset all defaults
  await db.update(schema.mailSecurity)
    .set({ isDefault: false, updatedAt: getCurrentTimestamp() })
    .where(eq(schema.mailSecurity.isDefault, true));

  // Set this one as default
  const [service] = await db.update(schema.mailSecurity)
    .set({ isDefault: true, updatedAt: getCurrentTimestamp() })
    .where(eq(schema.mailSecurity.id, id))
    .returning();

  return c.json({ service });
});

export default mailSecurity;
