import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp } from '../utils/dates.js';
import { parseId } from '../utils/validation.js';

const company = new Hono();

company.use('*', authMiddleware);

// Company Info schemas
const companyInfoSchema = z.object({
  name: z.string().min(1),
  logo: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  phone2: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  techContactName: z.string().nullable().optional(),
  techContactPhone: z.string().nullable().optional(),
  techContactEmail: z.string().email().nullable().optional(),
  pib: z.string().nullable().optional(),
  mib: z.string().nullable().optional(),
});

// Bank account schema
const bankAccountSchema = z.object({
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  swift: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

// Get company info
company.get('/info', async (c) => {
  const info = await db.select().from(schema.companyInfo).get();
  return c.json({ company: info || null });
});

// Create or update company info (upsert)
company.put('/info', adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = companyInfoSchema.parse(body);

    const existing = await db.select().from(schema.companyInfo).get();

    if (existing) {
      const [updated] = await db.update(schema.companyInfo)
        .set({
          ...data,
          updatedAt: getCurrentTimestamp(),
        })
        .where(eq(schema.companyInfo.id, existing.id))
        .returning();
      return c.json({ company: updated });
    } else {
      const [created] = await db.insert(schema.companyInfo)
        .values(data)
        .returning();
      return c.json({ company: created }, 201);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Upload logo
company.post('/logo', adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { logo } = body; // Base64 encoded image

    if (!logo || typeof logo !== 'string') {
      return c.json({ error: 'No logo provided' }, 400);
    }

    // Limit logo size to ~2MB (base64 is ~33% larger than binary)
    if (logo.length > 2.67 * 1024 * 1024) {
      return c.json({ error: 'Logo too large (max 2MB)' }, 400);
    }

    const existing = await db.select().from(schema.companyInfo).get();

    if (existing) {
      await db.update(schema.companyInfo)
        .set({ logo, updatedAt: getCurrentTimestamp() })
        .where(eq(schema.companyInfo.id, existing.id));
    } else {
      await db.insert(schema.companyInfo).values({ name: 'Company', logo });
    }

    return c.json({ message: 'Logo uploaded' });
  } catch (error) {
    throw error;
  }
});

// Delete logo
company.delete('/logo', adminMiddleware, async (c) => {
  const existing = await db.select().from(schema.companyInfo).get();

  if (existing) {
    await db.update(schema.companyInfo)
      .set({ logo: null, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.companyInfo.id, existing.id));
  }

  return c.json({ message: 'Logo deleted' });
});

// Get all bank accounts
company.get('/bank-accounts', async (c) => {
  const accounts = await db.select().from(schema.bankAccounts);
  return c.json({ accounts });
});

// Add bank account
company.post('/bank-accounts', adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = bankAccountSchema.parse(body);

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await db.update(schema.bankAccounts)
        .set({ isDefault: false, updatedAt: getCurrentTimestamp() });
    }

    const [account] = await db.insert(schema.bankAccounts)
      .values(data)
      .returning();

    return c.json({ account }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Update bank account
company.put('/bank-accounts/:id', adminMiddleware, async (c) => {
  try {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid bank account ID' }, 400);
    const body = await c.req.json();
    const data = bankAccountSchema.partial().parse(body);

    const existing = await db.select().from(schema.bankAccounts)
      .where(eq(schema.bankAccounts.id, id)).get();

    if (!existing) {
      return c.json({ error: 'Bank account not found' }, 404);
    }

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await db.update(schema.bankAccounts)
        .set({ isDefault: false, updatedAt: getCurrentTimestamp() });
    }

    const [account] = await db.update(schema.bankAccounts)
      .set({
        ...data,
        updatedAt: getCurrentTimestamp(),
      })
      .where(eq(schema.bankAccounts.id, id))
      .returning();

    return c.json({ account });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Delete bank account
company.delete('/bank-accounts/:id', adminMiddleware, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid bank account ID' }, 400);

  const existing = await db.select().from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.id, id)).get();

  if (!existing) {
    return c.json({ error: 'Bank account not found' }, 404);
  }

  await db.delete(schema.bankAccounts).where(eq(schema.bankAccounts.id, id));

  return c.json({ message: 'Bank account deleted' });
});

// Set default bank account
company.post('/bank-accounts/:id/set-default', adminMiddleware, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid bank account ID' }, 400);

  const existing = await db.select().from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.id, id)).get();

  if (!existing) {
    return c.json({ error: 'Bank account not found' }, 404);
  }

  // Unset all defaults
  await db.update(schema.bankAccounts)
    .set({ isDefault: false, updatedAt: getCurrentTimestamp() });

  // Set this one as default
  await db.update(schema.bankAccounts)
    .set({ isDefault: true, updatedAt: getCurrentTimestamp() })
    .where(eq(schema.bankAccounts.id, id));

  return c.json({ message: 'Default bank account set' });
});

export default company;
