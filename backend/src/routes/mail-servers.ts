import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp } from '../utils/dates.js';

const mailServers = new Hono();

mailServers.use('*', authMiddleware);

const mailServerSchema = z.object({
  name: z.string().min(1),
  hostname: z.string().min(1),
  description: z.string().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
});

// Get all mail servers
mailServers.get('/', async (c) => {
  const servers = await db.select().from(schema.mailServers);
  return c.json({ servers });
});

// Get default mail server
mailServers.get('/default', async (c) => {
  const server = await db.select().from(schema.mailServers).where(eq(schema.mailServers.isDefault, true)).get();
  return c.json({ server: server || null });
});

// Create mail server
mailServers.post('/', adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = mailServerSchema.parse(body);

    // If this server is being set as default, unset all others
    if (data.isDefault) {
      await db.update(schema.mailServers)
        .set({ isDefault: false, updatedAt: getCurrentTimestamp() });
    }

    const [server] = await db.insert(schema.mailServers).values(data).returning();

    return c.json({ server }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Update mail server
mailServers.put('/:id', adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = mailServerSchema.partial().parse(body);

    const existing = await db.select().from(schema.mailServers).where(eq(schema.mailServers.id, id)).get();
    if (!existing) {
      return c.json({ error: 'Mail server not found' }, 404);
    }

    // If this server is being set as default, unset all others
    if (data.isDefault) {
      await db.update(schema.mailServers)
        .set({ isDefault: false, updatedAt: getCurrentTimestamp() });
    }

    const [server] = await db.update(schema.mailServers)
      .set({ ...data, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.mailServers.id, id))
      .returning();

    return c.json({ server });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Delete mail server
mailServers.delete('/:id', adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.mailServers).where(eq(schema.mailServers.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Mail server not found' }, 404);
  }

  await db.delete(schema.mailServers).where(eq(schema.mailServers.id, id));

  return c.json({ message: 'Mail server deleted' });
});

// Set mail server as default
mailServers.post('/:id/set-default', adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.mailServers).where(eq(schema.mailServers.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Mail server not found' }, 404);
  }

  // Unset all defaults
  await db.update(schema.mailServers)
    .set({ isDefault: false, updatedAt: getCurrentTimestamp() });

  // Set this one as default
  const [server] = await db.update(schema.mailServers)
    .set({ isDefault: true, updatedAt: getCurrentTimestamp() })
    .where(eq(schema.mailServers.id, id))
    .returning();

  return c.json({ server });
});

export default mailServers;
