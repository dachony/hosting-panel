import { db, schema, SystemConfig } from '../db/index.js';
import { eq, and, gte, desc, count, isNotNull } from 'drizzle-orm';
import { statSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR = path.join(__dirname, '..', '..', 'src', 'fonts', 'OpenSans-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', '..', 'src', 'fonts', 'OpenSans-Bold.ttf');

// Get date filter based on period
function getDateFilter(period: SystemConfig['period']): string | null {
  const now = new Date();
  switch (period) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case 'last7days':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case 'last30days':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case 'all':
    default:
      return null;
  }
}

// Format date for display
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('sr-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Get blocked IPs
async function getBlockedIps(period: SystemConfig['period']) {
  const dateFilter = getDateFilter(period);

  let query = db.select().from(schema.blockedIps);
  if (dateFilter) {
    query = query.where(gte(schema.blockedIps.createdAt, dateFilter)) as typeof query;
  }

  return query.orderBy(desc(schema.blockedIps.createdAt));
}

// Get locked users
async function getLockedUsers() {
  const now = new Date().toISOString();
  return db.select({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    lockedUntil: schema.users.lockedUntil,
    failedLoginAttempts: schema.users.failedLoginAttempts,
  })
  .from(schema.users)
  .where(and(
    isNotNull(schema.users.lockedUntil),
    gte(schema.users.lockedUntil, now)
  ));
}

// Get failed login attempts
async function getFailedLogins(period: SystemConfig['period']) {
  const dateFilter = getDateFilter(period);

  const conditions = [eq(schema.loginAttempts.success, false)];
  if (dateFilter) {
    conditions.push(gte(schema.loginAttempts.createdAt, dateFilter));
  }

  return db.select().from(schema.loginAttempts).where(and(...conditions)).orderBy(desc(schema.loginAttempts.createdAt)).limit(100);
}

// Get password changes from audit log
async function getPasswordChanges(period: SystemConfig['period']) {
  const dateFilter = getDateFilter(period);

  const conditions = [
    eq(schema.auditLogs.entityType, 'user'),
    eq(schema.auditLogs.action, 'password_change'),
  ];
  if (dateFilter) {
    conditions.push(gte(schema.auditLogs.createdAt, dateFilter));
  }

  return db.select().from(schema.auditLogs).where(and(...conditions)).orderBy(desc(schema.auditLogs.createdAt)).limit(50);
}

// Get resource usage (disk space)
function getResourceUsage() {
  try {
    const dataDir = process.env.DATABASE_URL?.replace('file:', '').replace('/hosting.db', '') || './data';

    // Get directory size
    let totalSize = 0;
    const files: { name: string; size: number }[] = [];

    try {
      const entries = readdirSync(dataDir);
      for (const entry of entries) {
        try {
          const stats = statSync(join(dataDir, entry));
          if (stats.isFile()) {
            totalSize += stats.size;
            files.push({ name: entry, size: stats.size });
          }
        } catch {
          // Skip files we can't read
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return {
      totalSize,
      files: files.sort((a, b) => b.size - a.size),
    };
  } catch {
    return { totalSize: 0, files: [] };
  }
}

// Get database size
function getDatabaseSize() {
  try {
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './data/hosting.db';
    const stats = statSync(dbPath);
    return stats.size;
  } catch {
    return 0;
  }
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Generate HTML section
function generateSection(title: string, content: string, color: string = '#1e40af'): string {
  return `
  <div style="margin-bottom:20px;">
    <h3 style="margin:0 0 10px 0; padding:8px 12px; background:${color}; color:white; border-radius:4px 4px 0 0; font-size:14px;">
      ${title}
    </h3>
    <div style="border:1px solid #e5e7eb; border-top:none; border-radius:0 0 4px 4px; padding:12px;">
      ${content}
    </div>
  </div>`;
}

// Generate system info HTML
export async function generateSystemInfoHtml(config: SystemConfig): Promise<string> {
  const sections: string[] = [];
  const periodLabels: Record<SystemConfig['period'], string> = {
    today: 'Today',
    last7days: 'Last 7 days',
    last30days: 'Last 30 days',
    all: 'All time',
  };

  // Blocked IPs section
  if (config.sections.blockedIps) {
    const blockedIps = await getBlockedIps(config.period);

    if (blockedIps.length === 0) {
      sections.push(generateSection(
        '🛡️ Blocked IP Addresses',
        '<p style="color:#6b7280; margin:0;">No blocked IP addresses.</p>',
        '#dc2626'
      ));
    } else {
      const rows = blockedIps.map(ip => `
        <tr>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-family:monospace;">${ip.ipAddress}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${ip.reason || '-'}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${ip.permanent ? 'Permanent' : (ip.blockedUntil ? formatDate(ip.blockedUntil) : '-')}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${formatDate(ip.createdAt)}</td>
        </tr>
      `).join('');

      sections.push(generateSection(
        `🛡️ Blocked IP Addresses (${blockedIps.length})`,
        `<table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">IP Address</th>
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">Reason</th>
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">Blocked Until</th>
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">Created</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`,
        '#dc2626'
      ));
    }
  }

  // Locked users section
  if (config.sections.lockedUsers) {
    const lockedUsers = await getLockedUsers();

    if (lockedUsers.length === 0) {
      sections.push(generateSection(
        '🔒 Locked users',
        '<p style="color:#6b7280; margin:0;">No locked users.</p>',
        '#f59e0b'
      ));
    } else {
      const rows = lockedUsers.map(user => `
        <tr>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${user.name}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${user.email}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${user.failedLoginAttempts || 0}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${user.lockedUntil ? formatDate(user.lockedUntil) : '-'}</td>
        </tr>
      `).join('');

      sections.push(generateSection(
        `🔒 Locked users (${lockedUsers.length})`,
        `<table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">Name</th>
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">Email</th>
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">Failed attempts</th>
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">Locked until</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`,
        '#f59e0b'
      ));
    }
  }

  // Failed logins section (Fail2Ban style)
  if (config.sections.failedLogins) {
    const failedLogins = await getFailedLogins(config.period);

    // Group by IP address
    const byIp = new Map<string, { count: number; lastAttempt: string; emails: Set<string> }>();
    for (const login of failedLogins) {
      const existing = byIp.get(login.ipAddress) || { count: 0, lastAttempt: login.createdAt, emails: new Set() };
      existing.count++;
      if (login.email) existing.emails.add(login.email);
      if (login.createdAt > existing.lastAttempt) existing.lastAttempt = login.createdAt;
      byIp.set(login.ipAddress, existing);
    }

    if (byIp.size === 0) {
      sections.push(generateSection(
        '⚠️ Failed login attempts',
        '<p style="color:#6b7280; margin:0;">No failed login attempts.</p>',
        '#7c3aed'
      ));
    } else {
      const rows = Array.from(byIp.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([ip, data]) => `
          <tr>
            <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-family:monospace;">${ip}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:center;">
              <span style="background:${data.count >= 10 ? '#fee2e2' : data.count >= 5 ? '#fef3c7' : '#f3f4f6'}; padding:2px 8px; border-radius:10px; color:${data.count >= 10 ? '#dc2626' : data.count >= 5 ? '#d97706' : '#374151'};">
                ${data.count}
              </span>
            </td>
            <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-size:11px;">${Array.from(data.emails).slice(0, 3).join(', ') || '-'}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${formatDate(data.lastAttempt)}</td>
          </tr>
        `).join('');

      sections.push(generateSection(
        `⚠️ Failed login attempts - ${periodLabels[config.period]} (${failedLogins.length} total, ${byIp.size} IP addresses)`,
        `<table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">IP Address</th>
              <th style="padding:6px 8px; text-align:center; border-bottom:2px solid #e5e7eb;">Attempts</th>
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">Attempted emails</th>
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">Last attempt</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`,
        '#7c3aed'
      ));
    }
  }

  // Password changes section
  if (config.sections.passwordChanges) {
    const passwordChanges = await getPasswordChanges(config.period);

    if (passwordChanges.length === 0) {
      sections.push(generateSection(
        '🔑 Password changes',
        '<p style="color:#6b7280; margin:0;">No password changes in the selected period.</p>',
        '#059669'
      ));
    } else {
      const rows = passwordChanges.map(log => `
        <tr>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${log.userName}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${log.userEmail}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-family:monospace; font-size:11px;">${log.ipAddress || '-'}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${formatDate(log.createdAt)}</td>
        </tr>
      `).join('');

      sections.push(generateSection(
        `🔑 Password changes - ${periodLabels[config.period]} (${passwordChanges.length})`,
        `<table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">User</th>
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">Email</th>
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">IP Address</th>
              <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">Time</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`,
        '#059669'
      ));
    }
  }

  // Resource usage section
  if (config.sections.resourceUsage) {
    const resources = getResourceUsage();

    const fileRows = resources.files.slice(0, 10).map(file => `
      <tr>
        <td style="padding:4px 8px; border-bottom:1px solid #e5e7eb; font-family:monospace; font-size:12px;">${file.name}</td>
        <td style="padding:4px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${formatBytes(file.size)}</td>
      </tr>
    `).join('');

    sections.push(generateSection(
      '💾 Resource usage',
      `<div style="margin-bottom:10px;">
        <strong>Total data folder:</strong> ${formatBytes(resources.totalSize)}
      </div>
      ${fileRows ? `
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:4px 8px; text-align:left; border-bottom:2px solid #e5e7eb;">File</th>
            <th style="padding:4px 8px; text-align:right; border-bottom:2px solid #e5e7eb;">Size</th>
          </tr>
        </thead>
        <tbody>${fileRows}</tbody>
      </table>` : ''}`,
      '#0891b2'
    ));
  }

  // Database size section
  if (config.sections.databaseSize) {
    const dbSize = getDatabaseSize();

    // Get table counts
    const [clientsCount, domainsCount, webHostingCount, mailHostingCount, auditLogsCount] = await Promise.all([
      db.select({ count: count() }).from(schema.clients),
      db.select({ count: count() }).from(schema.domains),
      db.select({ count: count() }).from(schema.webHosting),
      db.select({ count: count() }).from(schema.mailHosting),
      db.select({ count: count() }).from(schema.auditLogs),
    ]);

    sections.push(generateSection(
      '🗄️ Database Information',
      `<table style="width:100%; border-collapse:collapse; font-size:13px;">
        <tr>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;"><strong>Database size:</strong></td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${formatBytes(dbSize)}</td>
        </tr>
        <tr>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">Clients:</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${clientsCount[0].count}</td>
        </tr>
        <tr>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">Domains:</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${domainsCount[0].count}</td>
        </tr>
        <tr>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">Web hosting:</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${webHostingCount[0].count}</td>
        </tr>
        <tr>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">Mail hosting:</td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${mailHostingCount[0].count}</td>
        </tr>
        <tr>
          <td style="padding:6px 8px;">Audit log entries:</td>
          <td style="padding:6px 8px; text-align:right;">${auditLogsCount[0].count}</td>
        </tr>
      </table>`,
      '#6366f1'
    ));
  }

  // Audit logs section
  if (config.sections.auditLogs) {
    const auditCount = await db.select({ count: count() }).from(schema.auditLogs);
    const total = auditCount[0].count;
    const threshold = config.thresholds?.auditLogsCount;
    const warning = threshold && total > threshold
      ? `<div style="margin-top:8px; padding:8px; background:#fef2f2; border:1px solid #fca5a5; border-radius:4px; color:#dc2626; font-size:12px;">⚠️ Audit log count (${total.toLocaleString()}) exceeds threshold (${threshold.toLocaleString()})</div>`
      : '';

    sections.push(generateSection(
      `📋 Audit Logs (${total.toLocaleString()} entries)`,
      `<table style="width:100%; border-collapse:collapse; font-size:13px;">
        <tr>
          <td style="padding:6px 8px;"><strong>Total entries:</strong></td>
          <td style="padding:6px 8px; text-align:right;">${total.toLocaleString()}</td>
        </tr>
      </table>${warning}`,
      '#ea580c'
    ));
  }

  // Email logs section
  if (config.sections.emailLogs) {
    const emailCount = await db.select({ count: count() }).from(schema.emailLogs);
    const total = emailCount[0].count;
    const threshold = config.thresholds?.emailLogsCount;
    const warning = threshold && total > threshold
      ? `<div style="margin-top:8px; padding:8px; background:#fef2f2; border:1px solid #fca5a5; border-radius:4px; color:#dc2626; font-size:12px;">⚠️ Email log count (${total.toLocaleString()}) exceeds threshold (${threshold.toLocaleString()})</div>`
      : '';

    sections.push(generateSection(
      `📧 Email Logs (${total.toLocaleString()} entries)`,
      `<table style="width:100%; border-collapse:collapse; font-size:13px;">
        <tr>
          <td style="padding:6px 8px;"><strong>Total entries:</strong></td>
          <td style="padding:6px 8px; text-align:right;">${total.toLocaleString()}</td>
        </tr>
      </table>${warning}`,
      '#0284c7'
    ));
  }

  // PDF documents section
  if (config.sections.pdfDocuments) {
    const pdfDir = '/app/data/pdfs';
    let fileCount = 0;
    let totalSize = 0;

    if (existsSync(pdfDir)) {
      try {
        const files = readdirSync(pdfDir);
        for (const file of files) {
          try {
            const stats = statSync(join(pdfDir, file));
            if (stats.isFile()) {
              fileCount++;
              totalSize += stats.size;
            }
          } catch { /* skip unreadable files */ }
        }
      } catch { /* directory not readable */ }
    }

    const sizeMb = totalSize / (1024 * 1024);
    const threshold = config.thresholds?.pdfSizeMb;
    const warning = threshold && sizeMb > threshold
      ? `<div style="margin-top:8px; padding:8px; background:#fef2f2; border:1px solid #fca5a5; border-radius:4px; color:#dc2626; font-size:12px;">⚠️ PDF storage (${formatBytes(totalSize)}) exceeds threshold (${threshold} MB)</div>`
      : '';

    sections.push(generateSection(
      `📄 PDF Documents (${fileCount} files)`,
      `<table style="width:100%; border-collapse:collapse; font-size:13px;">
        <tr>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;"><strong>File count:</strong></td>
          <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${fileCount}</td>
        </tr>
        <tr>
          <td style="padding:6px 8px;"><strong>Total size:</strong></td>
          <td style="padding:6px 8px; text-align:right;">${formatBytes(totalSize)}</td>
        </tr>
      </table>${warning}`,
      '#be123c'
    ));
  }

  if (sections.length === 0) {
    return '<p style="color:#6b7280;">No sections selected for display.</p>';
  }

  return sections.join('');
}

// Collect structured system data for JSON/CSV/PDF export
export async function collectSystemData(config: SystemConfig) {
  const data: Record<string, any> = {};
  const periodLabels: Record<SystemConfig['period'], string> = {
    today: 'Today',
    last7days: 'Last 7 days',
    last30days: 'Last 30 days',
    all: 'All time',
  };
  data.period = periodLabels[config.period];
  data.generatedAt = new Date().toISOString();

  if (config.sections.blockedIps) {
    data.blockedIps = await getBlockedIps(config.period);
  }
  if (config.sections.lockedUsers) {
    data.lockedUsers = await getLockedUsers();
  }
  if (config.sections.failedLogins) {
    const logins = await getFailedLogins(config.period);
    const byIp = new Map<string, { count: number; lastAttempt: string; emails: string[] }>();
    for (const login of logins) {
      const existing = byIp.get(login.ipAddress) || { count: 0, lastAttempt: login.createdAt, emails: [] };
      existing.count++;
      if (login.email && !existing.emails.includes(login.email)) existing.emails.push(login.email);
      if (login.createdAt > existing.lastAttempt) existing.lastAttempt = login.createdAt;
      byIp.set(login.ipAddress, existing);
    }
    data.failedLogins = { total: logins.length, byIp: Array.from(byIp.entries()).map(([ip, d]) => ({ ip, ...d })) };
  }
  if (config.sections.passwordChanges) {
    data.passwordChanges = await getPasswordChanges(config.period);
  }
  if (config.sections.resourceUsage) {
    data.resourceUsage = getResourceUsage();
  }
  if (config.sections.databaseSize) {
    const dbSize = getDatabaseSize();
    const [clientsCount, domainsCount, webHostingCount, mailHostingCount, auditLogsCount] = await Promise.all([
      db.select({ count: count() }).from(schema.clients),
      db.select({ count: count() }).from(schema.domains),
      db.select({ count: count() }).from(schema.webHosting),
      db.select({ count: count() }).from(schema.mailHosting),
      db.select({ count: count() }).from(schema.auditLogs),
    ]);
    data.database = {
      sizeBytes: dbSize, size: formatBytes(dbSize),
      clients: clientsCount[0].count, domains: domainsCount[0].count,
      webHosting: webHostingCount[0].count, mailHosting: mailHostingCount[0].count,
      auditLogs: auditLogsCount[0].count,
    };
  }
  if (config.sections.auditLogs) {
    const result = await db.select({ count: count() }).from(schema.auditLogs);
    data.auditLogs = { total: result[0].count, threshold: config.thresholds?.auditLogsCount };
  }
  if (config.sections.emailLogs) {
    const result = await db.select({ count: count() }).from(schema.emailLogs);
    data.emailLogs = { total: result[0].count, threshold: config.thresholds?.emailLogsCount };
  }
  if (config.sections.pdfDocuments) {
    const pdfDir = '/app/data/pdfs';
    let fileCount = 0, totalSize = 0;
    if (existsSync(pdfDir)) {
      try {
        for (const file of readdirSync(pdfDir)) {
          try { const s = statSync(join(pdfDir, file)); if (s.isFile()) { fileCount++; totalSize += s.size; } } catch {}
        }
      } catch {}
    }
    data.pdfDocuments = { fileCount, totalSizeBytes: totalSize, totalSize: formatBytes(totalSize), thresholdMb: config.thresholds?.pdfSizeMb };
  }

  return data;
}

// Generate system info as JSON string
export async function generateSystemInfoJson(config: SystemConfig): Promise<string> {
  const data = await collectSystemData(config);
  return JSON.stringify(data, null, 2);
}

// Generate system info as CSV string
export async function generateSystemInfoCsv(config: SystemConfig): Promise<string> {
  const data = await collectSystemData(config);
  const lines: string[] = [`System Info Report - ${data.period} - Generated: ${data.generatedAt}`, ''];

  if (data.blockedIps) {
    lines.push('BLOCKED IPS', 'IP Address,Reason,Blocked Until,Created');
    for (const ip of data.blockedIps) {
      lines.push(`${ip.ipAddress},"${(ip.reason || '-').replace(/"/g, '""')}",${ip.permanent ? 'Permanent' : (ip.blockedUntil || '-')},${ip.createdAt}`);
    }
    lines.push('');
  }
  if (data.lockedUsers) {
    lines.push('LOCKED USERS', 'Name,Email,Failed Attempts,Locked Until');
    for (const u of data.lockedUsers) {
      lines.push(`"${u.name}",${u.email},${u.failedLoginAttempts || 0},${u.lockedUntil || '-'}`);
    }
    lines.push('');
  }
  if (data.failedLogins) {
    lines.push('FAILED LOGINS', 'IP Address,Attempts,Emails,Last Attempt');
    for (const entry of data.failedLogins.byIp) {
      lines.push(`${entry.ip},${entry.count},"${entry.emails.join('; ')}",${entry.lastAttempt}`);
    }
    lines.push('');
  }
  if (data.passwordChanges) {
    lines.push('PASSWORD CHANGES', 'User,Email,IP Address,Time');
    for (const p of data.passwordChanges) {
      lines.push(`"${p.userName}",${p.userEmail},${p.ipAddress || '-'},${p.createdAt}`);
    }
    lines.push('');
  }
  if (data.resourceUsage) {
    lines.push('RESOURCE USAGE', `Total Size: ${formatBytes(data.resourceUsage.totalSize)}`, 'File,Size');
    for (const f of data.resourceUsage.files) {
      lines.push(`${f.name},${formatBytes(f.size)}`);
    }
    lines.push('');
  }
  if (data.database) {
    lines.push('DATABASE', `Size: ${data.database.size}`,
      `Clients: ${data.database.clients}`, `Domains: ${data.database.domains}`,
      `Mail Hosting: ${data.database.mailHosting}`, `Audit Logs: ${data.database.auditLogs}`, '');
  }
  if (data.auditLogs) {
    lines.push(`AUDIT LOGS: ${data.auditLogs.total} entries${data.auditLogs.threshold ? ` (threshold: ${data.auditLogs.threshold})` : ''}`, '');
  }
  if (data.emailLogs) {
    lines.push(`EMAIL LOGS: ${data.emailLogs.total} entries${data.emailLogs.threshold ? ` (threshold: ${data.emailLogs.threshold})` : ''}`, '');
  }
  if (data.pdfDocuments) {
    lines.push(`PDF DOCUMENTS: ${data.pdfDocuments.fileCount} files, ${data.pdfDocuments.totalSize}${data.pdfDocuments.thresholdMb ? ` (threshold: ${data.pdfDocuments.thresholdMb} MB)` : ''}`, '');
  }

  return lines.join('\n');
}

// Generate system info as PDF buffer
export async function generateSystemInfoPdf(config: SystemConfig): Promise<Buffer> {
  const data = await collectSystemData(config);

  const systemSetting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'system')).get();
  const systemName = (systemSetting?.value as { systemName?: string })?.systemName || 'Hosting Panel';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    doc.registerFont('OpenSans', FONT_REGULAR);
    doc.registerFont('OpenSans-Bold', FONT_BOLD);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageBottom = doc.page.height - 50;
    const tableLeft = 40;

    doc.fontSize(11).font('OpenSans-Bold').fill('#666').text(systemName, { align: 'center' });
    doc.fontSize(16).font('OpenSans-Bold').fill('#111').text('System Info Report', { align: 'center' });
    doc.fontSize(9).font('OpenSans').fill('#666').text(`Period: ${data.period} | Generated: ${new Date().toLocaleString('sr-RS')}`, { align: 'center' });
    doc.moveDown(1);

    const drawSectionHeader = (title: string, color: string) => {
      if (doc.y + 40 > pageBottom) doc.addPage();
      doc.save();
      doc.rect(tableLeft, doc.y, 515, 18).fill(color);
      doc.restore();
      doc.fontSize(10).font('OpenSans-Bold').fill('#fff').text(title, tableLeft + 6, doc.y + 4, { width: 503 });
      doc.y += 20;
      doc.x = tableLeft;
    };

    const drawKeyValue = (key: string, value: string) => {
      if (doc.y + 16 > pageBottom) doc.addPage();
      doc.fontSize(9).font('OpenSans-Bold').fill('#333').text(key + ': ', tableLeft + 6, doc.y, { continued: true, width: 505 });
      doc.font('OpenSans').text(value);
    };

    if (data.blockedIps) {
      drawSectionHeader(`Blocked IPs (${data.blockedIps.length})`, '#dc2626');
      if (data.blockedIps.length === 0) {
        drawKeyValue('Status', 'No blocked IPs');
      } else {
        for (const ip of data.blockedIps) {
          if (doc.y + 14 > pageBottom) doc.addPage();
          doc.fontSize(8).font('OpenSans').fill('#333').text(
            `${ip.ipAddress}  |  ${ip.reason || '-'}  |  ${ip.permanent ? 'Permanent' : (ip.blockedUntil ? formatDate(ip.blockedUntil) : '-')}`,
            tableLeft + 6, doc.y, { width: 505 }
          );
        }
      }
      doc.moveDown(0.5);
    }

    if (data.lockedUsers) {
      drawSectionHeader(`Locked Users (${data.lockedUsers.length})`, '#f59e0b');
      for (const u of data.lockedUsers) {
        if (doc.y + 14 > pageBottom) doc.addPage();
        doc.fontSize(8).font('OpenSans').fill('#333').text(
          `${u.name}  |  ${u.email}  |  Attempts: ${u.failedLoginAttempts || 0}  |  Until: ${u.lockedUntil ? formatDate(u.lockedUntil) : '-'}`,
          tableLeft + 6, doc.y, { width: 505 }
        );
      }
      doc.moveDown(0.5);
    }

    if (data.failedLogins) {
      drawSectionHeader(`Failed Logins (${data.failedLogins.total} total, ${data.failedLogins.byIp.length} IPs)`, '#7c3aed');
      for (const entry of data.failedLogins.byIp.slice(0, 20)) {
        if (doc.y + 14 > pageBottom) doc.addPage();
        doc.fontSize(8).font('OpenSans').fill('#333').text(
          `${entry.ip}  |  ${entry.count} attempts  |  ${entry.emails.slice(0, 3).join(', ') || '-'}`,
          tableLeft + 6, doc.y, { width: 505 }
        );
      }
      doc.moveDown(0.5);
    }

    if (data.passwordChanges) {
      drawSectionHeader(`Password Changes (${data.passwordChanges.length})`, '#059669');
      for (const p of data.passwordChanges) {
        if (doc.y + 14 > pageBottom) doc.addPage();
        doc.fontSize(8).font('OpenSans').fill('#333').text(
          `${p.userName}  |  ${p.userEmail}  |  ${p.ipAddress || '-'}  |  ${formatDate(p.createdAt)}`,
          tableLeft + 6, doc.y, { width: 505 }
        );
      }
      doc.moveDown(0.5);
    }

    if (data.resourceUsage) {
      drawSectionHeader('Resource Usage', '#0891b2');
      drawKeyValue('Total data folder', formatBytes(data.resourceUsage.totalSize));
      for (const f of data.resourceUsage.files.slice(0, 10)) {
        if (doc.y + 14 > pageBottom) doc.addPage();
        doc.fontSize(8).font('OpenSans').fill('#333').text(`${f.name}: ${formatBytes(f.size)}`, tableLeft + 6, doc.y, { width: 505 });
      }
      doc.moveDown(0.5);
    }

    if (data.database) {
      drawSectionHeader('Database', '#6366f1');
      drawKeyValue('Size', data.database.size);
      drawKeyValue('Clients', String(data.database.clients));
      drawKeyValue('Domains', String(data.database.domains));
      drawKeyValue('Mail Hosting', String(data.database.mailHosting));
      drawKeyValue('Audit Logs', String(data.database.auditLogs));
      doc.moveDown(0.5);
    }

    if (data.auditLogs) {
      drawSectionHeader('Audit Logs', '#ea580c');
      drawKeyValue('Total entries', String(data.auditLogs.total));
      if (data.auditLogs.threshold && data.auditLogs.total > data.auditLogs.threshold) {
        doc.fontSize(8).font('OpenSans-Bold').fill('#dc2626').text(
          `WARNING: Count (${data.auditLogs.total}) exceeds threshold (${data.auditLogs.threshold})`,
          tableLeft + 6, doc.y, { width: 505 }
        );
      }
      doc.moveDown(0.5);
    }

    if (data.emailLogs) {
      drawSectionHeader('Email Logs', '#0284c7');
      drawKeyValue('Total entries', String(data.emailLogs.total));
      if (data.emailLogs.threshold && data.emailLogs.total > data.emailLogs.threshold) {
        doc.fontSize(8).font('OpenSans-Bold').fill('#dc2626').text(
          `WARNING: Count (${data.emailLogs.total}) exceeds threshold (${data.emailLogs.threshold})`,
          tableLeft + 6, doc.y, { width: 505 }
        );
      }
      doc.moveDown(0.5);
    }

    if (data.pdfDocuments) {
      drawSectionHeader('PDF Documents', '#be123c');
      drawKeyValue('Files', String(data.pdfDocuments.fileCount));
      drawKeyValue('Total size', data.pdfDocuments.totalSize);
      if (data.pdfDocuments.thresholdMb) {
        const sizeMb = data.pdfDocuments.totalSizeBytes / (1024 * 1024);
        if (sizeMb > data.pdfDocuments.thresholdMb) {
          doc.fontSize(8).font('OpenSans-Bold').fill('#dc2626').text(
            `WARNING: Size (${data.pdfDocuments.totalSize}) exceeds threshold (${data.pdfDocuments.thresholdMb} MB)`,
            tableLeft + 6, doc.y, { width: 505 }
          );
        }
      }
      doc.moveDown(0.5);
    }

    doc.fontSize(7).font('OpenSans').fill('#999').text(`Generated by ${systemName}`, tableLeft, doc.y + 10);
    doc.end();
  });
}
