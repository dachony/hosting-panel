import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { sql } from 'drizzle-orm';
import os from 'os';
import fs from 'fs';

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

// Get email logs from MailHog
system.get('/emails', async (c) => {
  try {
    const start = parseInt(c.req.query('start') || '0');
    const limit = parseInt(c.req.query('limit') || '50');

    const mailhogUrl = `http://${process.env.SMTP_HOST || 'mailhog'}:8025/api/v2/messages?start=${start}&limit=${limit}`;

    const response = await fetch(mailhogUrl);

    if (!response.ok) {
      throw new Error(`MailHog responded with ${response.status}`);
    }

    const data = await response.json();

    return c.json({
      emails: data.items || [],
      total: data.total || 0,
      count: data.count || 0,
      start: data.start || 0,
    });
  } catch (error) {
    console.error('Email log error:', error);
    return c.json({
      emails: [],
      total: 0,
      count: 0,
      start: 0,
      error: 'MailHog not available'
    });
  }
});

// Delete emails from MailHog (all or older than X days)
system.delete('/emails', async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '0');
    const mailhogHost = `http://${process.env.SMTP_HOST || 'mailhog'}:8025`;

    // days=0 means delete all
    if (days === 0) {
      const response = await fetch(`${mailhogHost}/api/v1/messages`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`MailHog responded with ${response.status}`);
      }
      return c.json({ message: 'All emails deleted', deleted: -1 });
    }

    // Date-based deletion: fetch all emails, filter by date, delete individually
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let deleted = 0;
    let start = 0;
    const batchSize = 50;

    // Fetch all emails in batches to find old ones
    while (true) {
      const listRes = await fetch(`${mailhogHost}/api/v2/messages?start=${start}&limit=${batchSize}`);
      if (!listRes.ok) break;
      const data = await listRes.json();
      const items = data.items || [];
      if (items.length === 0) break;

      for (const item of items) {
        const created = new Date(item.Created);
        if (created < cutoffDate) {
          const delRes = await fetch(`${mailhogHost}/api/v1/messages/${item.ID}`, { method: 'DELETE' });
          if (delRes.ok) deleted++;
        }
      }

      start += batchSize;
      if (start >= (data.total || 0)) break;
    }

    return c.json({ message: `Deleted ${deleted} emails older than ${days} days`, deleted });
  } catch (error) {
    console.error('Delete emails error:', error);
    return c.json({ error: 'Failed to delete emails' }, 500);
  }
});

// Get email statistics from MailHog
system.get('/emails/stats', async (c) => {
  try {
    const mailhogUrl = `http://${process.env.SMTP_HOST || 'mailhog'}:8025/api/v2/messages?start=0&limit=1`;

    const response = await fetch(mailhogUrl);

    if (!response.ok) {
      throw new Error(`MailHog responded with ${response.status}`);
    }

    const data = await response.json();
    const total = data.total || 0;

    // Estimate size (~2KB average per email)
    const estimatedSize = total * 2048;

    return c.json({
      total,
      estimatedSize,
    });
  } catch (error) {
    console.error('Email stats error:', error);
    return c.json({
      total: 0,
      estimatedSize: 0,
      error: 'MailHog not available'
    });
  }
});

export default system;
