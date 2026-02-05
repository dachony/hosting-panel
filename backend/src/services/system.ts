import { db, schema, SystemConfig } from '../db/index.js';
import { eq, and, gte, desc, count, isNotNull } from 'drizzle-orm';
import { statSync, readdirSync } from 'fs';
import { join } from 'path';

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

  let query = db.select().from(schema.loginAttempts).where(eq(schema.loginAttempts.success, false));
  if (dateFilter) {
    query = query.where(and(
      eq(schema.loginAttempts.success, false),
      gte(schema.loginAttempts.createdAt, dateFilter)
    )) as typeof query;
  }

  return query.orderBy(desc(schema.loginAttempts.createdAt)).limit(100);
}

// Get password changes from audit log
async function getPasswordChanges(period: SystemConfig['period']) {
  const dateFilter = getDateFilter(period);

  let query = db.select().from(schema.auditLogs).where(
    and(
      eq(schema.auditLogs.entityType, 'user'),
      eq(schema.auditLogs.action, 'password_change')
    )
  );

  if (dateFilter) {
    query = query.where(and(
      eq(schema.auditLogs.entityType, 'user'),
      eq(schema.auditLogs.action, 'password_change'),
      gte(schema.auditLogs.createdAt, dateFilter)
    )) as typeof query;
  }

  return query.orderBy(desc(schema.auditLogs.createdAt)).limit(50);
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

  if (sections.length === 0) {
    return '<p style="color:#6b7280;">No sections selected for display.</p>';
  }

  return sections.join('');
}
