import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { sql, eq, or, like, desc, isNotNull } from 'drizzle-orm';
import os from 'os';
import fs from 'fs';
import path from 'path';

const system = new Hono();

system.use('*', authMiddleware);

// Get system status
system.get('/status', async (c) => {
  try {
    // CPU info
    const cpus = os.cpus();
    const cpuCount = cpus.length;
    const cpuModel = cpus[0]?.model || 'Unknown';

    // Calculate CPU usage
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpuCount;

    // Memory info
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = (usedMem / totalMem) * 100;

    // Disk info (for the data directory)
    let diskInfo = { total: 0, free: 0, used: 0, usagePercent: 0 };
    try {
      const stats = fs.statfsSync('/app/data');
      diskInfo = {
        total: stats.blocks * stats.bsize,
        free: stats.bfree * stats.bsize,
        used: (stats.blocks - stats.bfree) * stats.bsize,
        usagePercent: ((stats.blocks - stats.bfree) / stats.blocks) * 100,
      };
    } catch {
      // Fallback for systems without statfsSync
    }

    // System uptime
    const uptime = os.uptime();

    // Database stats
    const clientCount = await db.select({ count: sql<number>`count(*)` }).from(schema.clients);
    const domainCount = await db.select({ count: sql<number>`count(*)` }).from(schema.domains);
    const hostingCount = await db.select({ count: sql<number>`count(*)` }).from(schema.mailHosting);
    const userCount = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
    const templateCount = await db.select({ count: sql<number>`count(*)` }).from(schema.emailTemplates);
    const auditLogCount = await db.select({ count: sql<number>`count(*)` }).from(schema.auditLogs);

    // Database file size
    let dbSize = 0;
    try {
      const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './data/hosting.db';
      const dbStats = fs.statSync(dbPath);
      dbSize = dbStats.size;
    } catch {
      // Ignore
    }

    // Load average (Unix only)
    const loadAvg = os.loadavg();

    return c.json({
      cpu: {
        model: cpuModel,
        cores: cpuCount,
        usage: Math.round(cpuUsage * 100) / 100,
        loadAvg: loadAvg.map(l => Math.round(l * 100) / 100),
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: Math.round(memUsagePercent * 100) / 100,
      },
      disk: {
        total: diskInfo.total,
        used: diskInfo.used,
        free: diskInfo.free,
        usagePercent: Math.round(diskInfo.usagePercent * 100) / 100,
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        uptime: uptime,
        nodeVersion: process.version,
      },
      database: {
        size: dbSize,
        clients: clientCount[0]?.count || 0,
        domains: domainCount[0]?.count || 0,
        hosting: hostingCount[0]?.count || 0,
        users: userCount[0]?.count || 0,
        templates: templateCount[0]?.count || 0,
        auditLogs: auditLogCount[0]?.count || 0,
        auditLogsSize: (auditLogCount[0]?.count || 0) * 500, // Estimated ~500 bytes per log
      },
    });
  } catch (error) {
    console.error('System status error:', error);
    return c.json({ error: 'Failed to get system status' }, 500);
  }
});

// Get email logs from database
system.get('/emails', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '30');
    const search = c.req.query('search') || '';
    const offset = (page - 1) * limit;

    let query = db.select().from(schema.emailLogs);

    if (search) {
      query = query.where(
        or(
          like(schema.emailLogs.toEmail, `%${search}%`),
          like(schema.emailLogs.subject, `%${search}%`),
          like(schema.emailLogs.fromEmail, `%${search}%`)
        )
      ) as typeof query;
    }

    const emails = await query.orderBy(desc(schema.emailLogs.createdAt)).limit(limit).offset(offset);

    // Count total
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(schema.emailLogs);
    if (search) {
      countQuery = countQuery.where(
        or(
          like(schema.emailLogs.toEmail, `%${search}%`),
          like(schema.emailLogs.subject, `%${search}%`),
          like(schema.emailLogs.fromEmail, `%${search}%`)
        )
      ) as typeof countQuery;
    }
    const totalResult = await countQuery;
    const total = totalResult[0]?.count || 0;

    return c.json({
      emails,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Email log error:', error);
    return c.json({ error: 'Failed to load email logs' }, 500);
  }
});

// Get email statistics (must be before /emails/:id)
system.get('/emails/stats', async (c) => {
  try {
    const totalResult = await db.select({ count: sql<number>`count(*)` }).from(schema.emailLogs);
    const total = totalResult[0]?.count || 0;

    const sentResult = await db.select({ count: sql<number>`count(*)` }).from(schema.emailLogs)
      .where(eq(schema.emailLogs.status, 'sent'));
    const sent = sentResult[0]?.count || 0;

    const failedResult = await db.select({ count: sql<number>`count(*)` }).from(schema.emailLogs)
      .where(eq(schema.emailLogs.status, 'failed'));
    const failed = failedResult[0]?.count || 0;

    // Estimate size based on average email size (~2KB)
    const estimatedSize = total * 2048;

    return c.json({ total, sent, failed, estimatedSize });
  } catch (error) {
    console.error('Email stats error:', error);
    return c.json({ total: 0, sent: 0, failed: 0, estimatedSize: 0 }, 500);
  }
});

// Get single email by ID
system.get('/emails/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const email = await db.select().from(schema.emailLogs).where(eq(schema.emailLogs.id, id)).get();

    if (!email) {
      return c.json({ error: 'Email not found' }, 404);
    }

    return c.json(email);
  } catch (error) {
    console.error('Email detail error:', error);
    return c.json({ error: 'Failed to load email' }, 500);
  }
});

// Delete email logs (all or older than X days)
system.delete('/emails', async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '0');

    if (days === 0) {
      await db.delete(schema.emailLogs);
      return c.json({ message: 'All email logs deleted' });
    }

    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    await db.delete(schema.emailLogs).where(
      sql`${schema.emailLogs.createdAt} < ${cutoffDate}`
    );

    return c.json({ message: `Deleted email logs older than ${days} days` });
  } catch (error) {
    console.error('Delete emails error:', error);
    return c.json({ error: 'Failed to delete email logs' }, 500);
  }
});

// PDF Documents stats
const PDF_DIR = '/app/data/pdfs';

system.get('/pdfs/stats', async (c) => {
  try {
    let totalSize = 0;
    let fileCount = 0;

    if (fs.existsSync(PDF_DIR)) {
      const files = fs.readdirSync(PDF_DIR);
      for (const file of files) {
        const filePath = path.join(PDF_DIR, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          totalSize += stat.size;
          fileCount++;
        }
      }
    }

    // Count domains with PDFs
    const domainsWithPdf = await db.select({ count: sql<number>`count(*)` })
      .from(schema.domains)
      .where(isNotNull(schema.domains.pdfFilename));

    return c.json({
      totalSize,
      fileCount,
      domainsWithPdf: domainsWithPdf[0]?.count || 0,
    });
  } catch (error) {
    console.error('PDF stats error:', error);
    return c.json({ totalSize: 0, fileCount: 0, domainsWithPdf: 0 }, 500);
  }
});

// Delete old PDF documents
system.delete('/pdfs', async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '0');

    if (!fs.existsSync(PDF_DIR)) {
      return c.json({ message: 'No PDF directory', deleted: 0 });
    }

    const files = fs.readdirSync(PDF_DIR);
    const cutoffTime = days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : Infinity;
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(PDF_DIR, file);
      const stat = fs.statSync(filePath);

      if (!stat.isFile()) continue;

      const shouldDelete = days === 0 || stat.mtimeMs < cutoffTime;
      if (!shouldDelete) continue;

      // Extract domainId from filename (format: {domainId}_{filename})
      const domainIdStr = file.split('_')[0];
      const domainId = parseInt(domainIdStr);

      fs.unlinkSync(filePath);
      deletedCount++;

      // Clear pdfFilename in database
      if (!isNaN(domainId)) {
        await db.update(schema.domains)
          .set({ pdfFilename: null })
          .where(eq(schema.domains.id, domainId));
      }
    }

    return c.json({ message: `Deleted ${deletedCount} PDF files`, deleted: deletedCount });
  } catch (error) {
    console.error('Delete PDFs error:', error);
    return c.json({ error: 'Failed to delete PDF files' }, 500);
  }
});

export default system;
