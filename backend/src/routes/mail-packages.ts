import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, salesAdminMiddleware, packageEditMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp } from '../utils/dates.js';
import { parseId } from '../utils/validation.js';

const mailPackages = new Hono();

// Base auth for all routes
mailPackages.use('*', authMiddleware);

const packageSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  maxMailboxes: z.number().int().min(1).default(5),
  storageGb: z.number().min(0).default(5),
  price: z.number().min(0).default(0),
  features: z.array(z.string()).optional().nullable(),
  mailServerId: z.number().int().optional().nullable(),
  mailSecurityId: z.number().int().optional().nullable(),
});

// GET all packages - salesadmin and above can view
mailPackages.get('/', salesAdminMiddleware, async (c) => {
  const packages = await db.select({
    id: schema.mailPackages.id,
    name: schema.mailPackages.name,
    description: schema.mailPackages.description,
    maxMailboxes: schema.mailPackages.maxMailboxes,
    storageGb: schema.mailPackages.storageGb,
    price: schema.mailPackages.price,
    features: schema.mailPackages.features,
    mailServerId: schema.mailPackages.mailServerId,
    mailServerName: schema.mailServers.name,
    mailSecurityId: schema.mailPackages.mailSecurityId,
    mailSecurityName: schema.mailSecurity.name,
    createdAt: schema.mailPackages.createdAt,
    updatedAt: schema.mailPackages.updatedAt,
  })
    .from(schema.mailPackages)
    .leftJoin(schema.mailServers, eq(schema.mailPackages.mailServerId, schema.mailServers.id))
    .leftJoin(schema.mailSecurity, eq(schema.mailPackages.mailSecurityId, schema.mailSecurity.id));
  return c.json({ packages });
});

// GET single package - salesadmin and above can view
mailPackages.get('/:id', salesAdminMiddleware, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid package ID' }, 400);

  const pkg = await db.select().from(schema.mailPackages).where(eq(schema.mailPackages.id, id)).get();

  if (!pkg) {
    return c.json({ error: 'Package not found' }, 404);
  }

  return c.json({ package: pkg });
});

// POST create package - salesadmin and above can add
mailPackages.post('/', salesAdminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = packageSchema.parse(body);

    const [pkg] = await db.insert(schema.mailPackages).values(data).returning();

    return c.json({ package: pkg }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// PUT update package - only admin and superadmin (not salesadmin)
mailPackages.put('/:id', packageEditMiddleware, async (c) => {
  try {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid package ID' }, 400);
    const body = await c.req.json();
    const data = packageSchema.partial().parse(body);

    const existing = await db.select().from(schema.mailPackages).where(eq(schema.mailPackages.id, id)).get();
    if (!existing) {
      return c.json({ error: 'Package not found' }, 404);
    }

    const [pkg] = await db.update(schema.mailPackages)
      .set({ ...data, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.mailPackages.id, id))
      .returning();

    return c.json({ package: pkg });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// DELETE package - only admin and superadmin (not salesadmin)
mailPackages.delete('/:id', packageEditMiddleware, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid package ID' }, 400);

  const existing = await db.select().from(schema.mailPackages).where(eq(schema.mailPackages.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Package not found' }, 404);
  }

  await db.delete(schema.mailPackages).where(eq(schema.mailPackages.id, id));

  return c.json({ message: 'Package deleted' });
});

export default mailPackages;
