import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, superAdminMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp } from '../utils/dates.js';
import fs from 'fs';
import path from 'path';

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
      pdfFilename: schema.domains.pdfFilename,
      isActive: schema.domains.isActive,
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
      pdfFilename: schema.domains.pdfFilename,
      isActive: schema.domains.isActive,
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

// PDF storage directory
const PDF_DIR = '/app/data/pdfs';

function ensurePdfDir() {
  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
  }
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getDomainPdfPath(domainId: number, filename: string): string {
  return path.join(PDF_DIR, `${domainId}_${sanitizeFilename(filename)}`);
}

function deletePdfFile(domainId: number, pdfFilename: string | null) {
  if (!pdfFilename) return;
  const filePath = getDomainPdfPath(domainId, pdfFilename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// Upload PDF for a domain
domains.post('/:id/pdf', async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.domains).where(eq(schema.domains.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Domain not found' }, 404);
  }

  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file uploaded' }, 400);
  }

  if (file.type !== 'application/pdf') {
    return c.json({ error: 'Only PDF files are allowed' }, 400);
  }

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_SIZE) {
    return c.json({ error: 'File too large (max 10MB)' }, 400);
  }

  ensurePdfDir();

  // Delete old PDF if exists
  deletePdfFile(id, existing.pdfFilename);

  const filename = sanitizeFilename(file.name);
  const filePath = getDomainPdfPath(id, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  await db.update(schema.domains)
    .set({ pdfFilename: filename, updatedAt: getCurrentTimestamp() })
    .where(eq(schema.domains.id, id));

  return c.json({ pdfFilename: filename });
});

// Download PDF for a domain
domains.get('/:id/pdf', async (c) => {
  const id = parseInt(c.req.param('id'));

  const domain = await db.select().from(schema.domains).where(eq(schema.domains.id, id)).get();
  if (!domain || !domain.pdfFilename) {
    return c.json({ error: 'PDF not found' }, 404);
  }

  const filePath = getDomainPdfPath(id, domain.pdfFilename);
  if (!fs.existsSync(filePath)) {
    return c.json({ error: 'PDF file not found on disk' }, 404);
  }

  const fileBuffer = fs.readFileSync(filePath);
  return new Response(fileBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${domain.pdfFilename}"`,
    },
  });
});

// Delete PDF for a domain
domains.delete('/:id/pdf', async (c) => {
  const id = parseInt(c.req.param('id'));

  const domain = await db.select().from(schema.domains).where(eq(schema.domains.id, id)).get();
  if (!domain) {
    return c.json({ error: 'Domain not found' }, 404);
  }

  deletePdfFile(id, domain.pdfFilename);

  await db.update(schema.domains)
    .set({ pdfFilename: null, updatedAt: getCurrentTimestamp() })
    .where(eq(schema.domains.id, id));

  return c.json({ message: 'PDF deleted' });
});

domains.post('/:id/toggle', async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.domains).where(eq(schema.domains.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Domain not found' }, 404);
  }

  const [updated] = await db.update(schema.domains)
    .set({
      isActive: !existing.isActive,
      updatedAt: getCurrentTimestamp(),
    })
    .where(eq(schema.domains.id, id))
    .returning();

  return c.json({ domain: updated });
});

domains.delete('/:id', superAdminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.select().from(schema.domains).where(eq(schema.domains.id, id)).get();
  if (!existing) {
    return c.json({ error: 'Domain not found' }, 404);
  }

  // Delete PDF file if exists
  deletePdfFile(id, existing.pdfFilename);

  // Delete associated hosting records to prevent orphans
  await db.delete(schema.webHosting).where(eq(schema.webHosting.domainId, id));
  await db.delete(schema.mailHosting).where(eq(schema.mailHosting.domainId, id));

  await db.delete(schema.domains).where(eq(schema.domains.id, id));

  return c.json({ message: 'Domain deleted' });
});

export default domains;
