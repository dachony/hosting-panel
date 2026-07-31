import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp } from '../utils/dates.js';
import { parseId } from '../utils/validation.js';

const webServers = new Hono();

webServers.use('*', authMiddleware);

const webServerSchema = z.object({
  name: z.string().min(1),
  hostname: z.string().min(1),
  description: z.string().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
});

// Get all web servers
webServers.get('/', async (c) => {
  const servers = await db.select().from(schema.webServers);
  return c.json({ servers });
});

// Get default web server
webServers.get('/default', async (c) => {
  const server = await db.select().from(schema.webServers).where(eq(schema.webServers.isDefault, true)).get();
  return c.json({ server: server || null });
});

// Create web server
webServers.post('/', adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = webServerSchema.parse(body);

    // If this server is being set as default, unset all others
    if (data.isDefault) {
      await db.update(schema.webServers)
        .set({ isDefault: false, updatedAt: getCurrentTimestamp() });
    }

    const [server] = await db.insert(schema.webServers).values(data).returning();

    return c.json({ server }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Update web server
webServers.put('/:id', adminMiddleware, async (c) => {
  try {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid web server ID' }, 400);
    const body = await c.req.json();
    const data = webServerSchema.partial().parse(body);

    const existing = await db.select().from(schema.webServers).where(eq(schema.webServers.id, id)).get();
    if (!existing) {
      return c.json({ error: 'Web server not found' }, 404);
    }

    // If this server is being set as default, unset all others
    if (data.isDefault) {
      await db.update(schema.webServers)
        .set({ isDefault: false, updatedAt: getCurrentTimestamp() });
    }

    const [server] = await db.update(schema.webServers)
      .set({ ...data, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.webServers.id, id))
      .returning();

    return c.json({ server });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Delete web server
webServers.delete('/:id', adminMiddleware, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid web server ID' }, 400);

  const existing = await db.select().from(schema.webServers).where(eq(schema.webServers.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Web server not found' }, 404);
  }

  await db.delete(schema.webServers).where(eq(schema.webServers.id, id));

  return c.json({ message: 'Web server deleted' });
});

// Set web server as default
webServers.post('/:id/set-default', adminMiddleware, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid web server ID' }, 400);

  const existing = await db.select().from(schema.webServers).where(eq(schema.webServers.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Web server not found' }, 404);
  }

  // Unset all defaults
  await db.update(schema.webServers)
    .set({ isDefault: false, updatedAt: getCurrentTimestamp() });

  // Set this one as default
  const [server] = await db.update(schema.webServers)
    .set({ isDefault: true, updatedAt: getCurrentTimestamp() })
    .where(eq(schema.webServers.id, id))
    .returning();

  return c.json({ server });
});

export default webServers;
