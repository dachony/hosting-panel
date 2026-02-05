import { db, schema } from '../db/index.js';
import { eq, and, lte, gte, count } from 'drizzle-orm';
import { formatDate, addDaysToDate, daysUntilExpiry, getDomainStatus, DomainStatus } from '../utils/dates.js';
import { ReportConfig } from '../db/schema.js';

export interface DashboardStats {
  totalClients: number;
  totalDomains: number;
  totalActiveDomains: number;
  totalHosting: number;
  totalActiveHosting: number;
  expiringDomains: number;
  expiringHosting: number;
  willBeDeletedCount: number;
}

export interface ExpiringItem {
  id: number;
  type: 'domain' | 'hosting' | 'mail';
  name: string;
  clientName: string | null;
  expiryDate: string;
  daysUntilExpiry: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = formatDate(new Date());
  const thirtyDaysLater = addDaysToDate(new Date(), 30);
  const sixtyDaysAgo = addDaysToDate(new Date(), -60); // Items expired 60+ days ago will be deleted

  const [
    clientsResult,
    domainsResult,
    activeDomainsResult,
    webHostingResult,
    mailHostingResult,
    activeWebHostingResult,
    activeMailHostingResult,
    expiringDomainsResult,
    expiringWebHostingResult,
    expiringMailHostingResult,
    willBeDeletedWebResult,
    willBeDeletedMailResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(schema.clients),
    db.select({ count: count() }).from(schema.domains),
    db.select({ count: count() }).from(schema.domains).where(gte(schema.domains.expiryDate, today)),
    db.select({ count: count() }).from(schema.webHosting),
    db.select({ count: count() }).from(schema.mailHosting),
    db.select({ count: count() }).from(schema.webHosting).where(gte(schema.webHosting.expiryDate, today)),
    db.select({ count: count() }).from(schema.mailHosting).where(gte(schema.mailHosting.expiryDate, today)),
    db.select({ count: count() }).from(schema.domains).where(and(
      gte(schema.domains.expiryDate, today),
      lte(schema.domains.expiryDate, thirtyDaysLater)
    )),
    db.select({ count: count() }).from(schema.webHosting).where(and(
      gte(schema.webHosting.expiryDate, today),
      lte(schema.webHosting.expiryDate, thirtyDaysLater)
    )),
    db.select({ count: count() }).from(schema.mailHosting).where(and(
      gte(schema.mailHosting.expiryDate, today),
      lte(schema.mailHosting.expiryDate, thirtyDaysLater)
    )),
    // Will be deleted: expired more than 60 days ago
    db.select({ count: count() }).from(schema.webHosting).where(lte(schema.webHosting.expiryDate, sixtyDaysAgo)),
    db.select({ count: count() }).from(schema.mailHosting).where(lte(schema.mailHosting.expiryDate, sixtyDaysAgo)),
  ]);

  return {
    totalClients: clientsResult[0].count,
    totalDomains: domainsResult[0].count,
    totalActiveDomains: activeDomainsResult[0].count,
    totalHosting: webHostingResult[0].count + mailHostingResult[0].count,
    totalActiveHosting: activeWebHostingResult[0].count + activeMailHostingResult[0].count,
    expiringDomains: expiringDomainsResult[0].count,
    expiringHosting: expiringWebHostingResult[0].count + expiringMailHostingResult[0].count,
    willBeDeletedCount: willBeDeletedWebResult[0].count + willBeDeletedMailResult[0].count,
  };
}

export async function getExpiringItems(days: number = 30): Promise<ExpiringItem[]> {
  const today = formatDate(new Date());
  const futureDate = addDaysToDate(new Date(), days);

  const [domains, hosting, mail] = await Promise.all([
    db.select({
      id: schema.domains.id,
      domainName: schema.domains.domainName,
      expiryDate: schema.domains.expiryDate,
      clientName: schema.clients.name,
    })
    .from(schema.domains)
    .leftJoin(schema.clients, eq(schema.domains.clientId, schema.clients.id))
    .where(and(
      gte(schema.domains.expiryDate, today),
      lte(schema.domains.expiryDate, futureDate)
    )),

    db.select({
      id: schema.webHosting.id,
      packageName: schema.webHosting.packageName,
      expiryDate: schema.webHosting.expiryDate,
      clientName: schema.clients.name,
      domainName: schema.domains.domainName,
    })
    .from(schema.webHosting)
    .leftJoin(schema.clients, eq(schema.webHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.webHosting.domainId, schema.domains.id))
    .where(and(
      gte(schema.webHosting.expiryDate, today),
      lte(schema.webHosting.expiryDate, futureDate)
    )),

    db.select({
      id: schema.mailHosting.id,
      expiryDate: schema.mailHosting.expiryDate,
      clientName: schema.clients.name,
      domainName: schema.domains.domainName,
      packageName: schema.mailPackages.name,
    })
    .from(schema.mailHosting)
    .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
    .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id))
    .where(and(
      gte(schema.mailHosting.expiryDate, today),
      lte(schema.mailHosting.expiryDate, futureDate)
    )),
  ]);

  const items: ExpiringItem[] = [
    ...domains.map(d => ({
      id: d.id,
      type: 'domain' as const,
      name: d.domainName,
      clientName: d.clientName,
      expiryDate: d.expiryDate,
      daysUntilExpiry: daysUntilExpiry(d.expiryDate),
    })),
    ...hosting.map(h => ({
      id: h.id,
      type: 'hosting' as const,
      name: h.domainName || h.packageName,
      clientName: h.clientName,
      expiryDate: h.expiryDate,
      daysUntilExpiry: daysUntilExpiry(h.expiryDate),
    })),
    ...mail.map(m => ({
      id: m.id,
      type: 'mail' as const,
      name: m.domainName || m.packageName || 'Mail hosting',
      clientName: m.clientName,
      expiryDate: m.expiryDate,
      daysUntilExpiry: daysUntilExpiry(m.expiryDate),
    })),
  ];

  return items.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

export async function getWillBeDeletedItems(): Promise<ExpiringItem[]> {
  const sixtyDaysAgo = addDaysToDate(new Date(), -60);

  const [hosting, mail] = await Promise.all([
    db.select({
      id: schema.webHosting.id,
      packageName: schema.webHosting.packageName,
      expiryDate: schema.webHosting.expiryDate,
      clientName: schema.clients.name,
      domainName: schema.domains.domainName,
    })
    .from(schema.webHosting)
    .leftJoin(schema.clients, eq(schema.webHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.webHosting.domainId, schema.domains.id))
    .where(lte(schema.webHosting.expiryDate, sixtyDaysAgo)),

    db.select({
      id: schema.mailHosting.id,
      expiryDate: schema.mailHosting.expiryDate,
      clientName: schema.clients.name,
      domainName: schema.domains.domainName,
      packageName: schema.mailPackages.name,
    })
    .from(schema.mailHosting)
    .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
    .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id))
    .where(lte(schema.mailHosting.expiryDate, sixtyDaysAgo)),
  ]);

  const items: ExpiringItem[] = [
    ...hosting.map(h => ({
      id: h.id,
      type: 'hosting' as const,
      name: h.domainName || h.packageName,
      clientName: h.clientName,
      expiryDate: h.expiryDate,
      daysUntilExpiry: daysUntilExpiry(h.expiryDate),
    })),
    ...mail.map(m => ({
      id: m.id,
      type: 'mail' as const,
      name: m.domainName || m.packageName || 'Mail hosting',
      clientName: m.clientName,
      expiryDate: m.expiryDate,
      daysUntilExpiry: daysUntilExpiry(m.expiryDate),
    })),
  ];

  // Sort by expiry date ascending (most overdue first, which is most negative daysUntilExpiry)
  return items.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

export async function getRecentActivity(limit: number = 10) {
  const notifications = await db.select()
    .from(schema.notificationLog)
    .orderBy(schema.notificationLog.sentAt)
    .limit(limit);

  return notifications;
}

// Status colors for HTML table
const statusColors: Record<DomainStatus, { bg: string; text: string; label: string }> = {
  green: { bg: '#dcfce7', text: '#166534', label: 'OK' },
  yellow: { bg: '#fef9c3', text: '#854d0e', label: 'Warning' },
  orange: { bg: '#ffedd5', text: '#c2410c', label: 'Critical' },
  red: { bg: '#fee2e2', text: '#dc2626', label: 'Expired' },
  forDeletion: { bg: '#f3e8ff', text: '#7c3aed', label: 'For Deletion' },
  deleted: { bg: '#f3f4f6', text: '#6b7280', label: 'Deleted' },
};

interface HostingItem {
  id: number;
  type: 'web' | 'mail';
  domainName: string | null;
  clientName: string | null;
  expiryDate: string;
  daysUntilExpiry: number;
  status: DomainStatus;
  packageName: string | null;
  isEnabled: boolean;
}

export async function generateHostingListHtml(config: ReportConfig): Promise<string> {
  // Query web_hosting and mail_hosting
  const [webHosting, mailHosting] = await Promise.all([
    db.select({
      id: schema.webHosting.id,
      packageName: schema.webHosting.packageName,
      expiryDate: schema.webHosting.expiryDate,
      isEnabled: schema.webHosting.isEnabled,
      clientName: schema.clients.name,
      domainName: schema.domains.domainName,
    })
    .from(schema.webHosting)
    .leftJoin(schema.clients, eq(schema.webHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.webHosting.domainId, schema.domains.id)),

    db.select({
      id: schema.mailHosting.id,
      expiryDate: schema.mailHosting.expiryDate,
      isActive: schema.mailHosting.isActive,
      clientName: schema.clients.name,
      domainName: schema.domains.domainName,
      packageName: schema.mailPackages.name,
    })
    .from(schema.mailHosting)
    .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
    .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id)),
  ]);

  // Transform to unified format with status
  const items: HostingItem[] = [
    ...webHosting.map(h => {
      const days = daysUntilExpiry(h.expiryDate);
      return {
        id: h.id,
        type: 'web' as const,
        domainName: h.domainName,
        clientName: h.clientName,
        expiryDate: h.expiryDate,
        daysUntilExpiry: days,
        status: getDomainStatus(days),
        packageName: h.packageName,
        isEnabled: h.isEnabled !== false,
      };
    }),
    ...mailHosting.map(m => {
      const days = daysUntilExpiry(m.expiryDate);
      return {
        id: m.id,
        type: 'mail' as const,
        domainName: m.domainName,
        clientName: m.clientName,
        expiryDate: m.expiryDate,
        daysUntilExpiry: days,
        status: getDomainStatus(days),
        packageName: m.packageName,
        isEnabled: m.isActive !== false,
      };
    }),
  ];

  // Filter by statuses
  const filteredItems = items.filter(item =>
    config.filters.statuses.includes(item.status)
  );

  // Sort items
  const sortedItems = [...filteredItems].sort((a, b) => {
    let comparison = 0;
    switch (config.sorting.field) {
      case 'domainName':
        comparison = (a.domainName || '').localeCompare(b.domainName || '');
        break;
      case 'clientName':
        comparison = (a.clientName || '').localeCompare(b.clientName || '');
        break;
      case 'expiryDate':
        comparison = a.daysUntilExpiry - b.daysUntilExpiry;
        break;
    }
    return config.sorting.direction === 'asc' ? comparison : -comparison;
  });

  // Format date for display
  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Generate table rows
  const generateRow = (item: HostingItem) => {
    const color = statusColors[item.status];
    const daysText = item.daysUntilExpiry > 0
      ? `${item.daysUntilExpiry}`
      : item.daysUntilExpiry === 0
        ? 'Today'
        : `${Math.abs(item.daysUntilExpiry)} expired`;
    const enabledBg = item.isEnabled ? '#dcfce7' : '#f3f4f6';
    const enabledText = item.isEnabled ? '#166534' : '#6b7280';
    const enabledLabel = item.isEnabled ? 'Enabled' : 'Disabled';

    return `
    <tr>
      <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${item.domainName || item.packageName || '-'}</td>
      <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${item.clientName || '-'}</td>
      <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${formatDisplayDate(item.expiryDate)}</td>
      <td style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:center;">${daysText}</td>
      <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
        <span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:12px; background:${color.bg}; color:${color.text};">${color.label}</span>
      </td>
      <td style="padding:8px; border-bottom:1px solid #e5e7eb;">
        <span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:12px; background:${enabledBg}; color:${enabledText};">${enabledLabel}</span>
      </td>
    </tr>`;
  };

  // Generate HTML based on groupByStatus
  if (config.groupByStatus) {
    // Group items by status
    const statusOrder: DomainStatus[] = ['deleted', 'forDeletion', 'red', 'orange', 'yellow', 'green'];
    const grouped = statusOrder
      .filter(status => config.filters.statuses.includes(status))
      .map(status => ({
        status,
        items: sortedItems.filter(item => item.status === status),
      }))
      .filter(group => group.items.length > 0);

    let html = '';
    for (const group of grouped) {
      const color = statusColors[group.status];
      html += `
      <h3 style="margin:20px 0 10px 0; padding:8px; background:${color.bg}; color:${color.text}; border-radius:4px;">
        ${color.label} (${group.items.length})
      </h3>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px; text-align:left; border-bottom:2px solid #e5e7eb;">Domain</th>
            <th style="padding:8px; text-align:left; border-bottom:2px solid #e5e7eb;">Client</th>
            <th style="padding:8px; text-align:left; border-bottom:2px solid #e5e7eb;">Expiry Date</th>
            <th style="padding:8px; text-align:center; border-bottom:2px solid #e5e7eb;">Days</th>
            <th style="padding:8px; text-align:left; border-bottom:2px solid #e5e7eb;">Status</th>
            <th style="padding:8px; text-align:left; border-bottom:2px solid #e5e7eb;">Active</th>
          </tr>
        </thead>
        <tbody>
          ${group.items.map(generateRow).join('')}
        </tbody>
      </table>`;
    }
    return html || '<p style="color:#6b7280;">No items match the selected filters.</p>';
  } else {
    // Single table without grouping
    if (sortedItems.length === 0) {
      return '<p style="color:#6b7280;">No items match the selected filters.</p>';
    }

    return `
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px; text-align:left; border-bottom:2px solid #e5e7eb;">Domain</th>
          <th style="padding:8px; text-align:left; border-bottom:2px solid #e5e7eb;">Client</th>
          <th style="padding:8px; text-align:left; border-bottom:2px solid #e5e7eb;">Expiry Date</th>
          <th style="padding:8px; text-align:center; border-bottom:2px solid #e5e7eb;">Days</th>
          <th style="padding:8px; text-align:left; border-bottom:2px solid #e5e7eb;">Status</th>
          <th style="padding:8px; text-align:left; border-bottom:2px solid #e5e7eb;">Active</th>
        </tr>
      </thead>
      <tbody>
        ${sortedItems.map(generateRow).join('')}
      </tbody>
    </table>`;
  }
}
