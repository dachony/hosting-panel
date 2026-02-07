import { db, schema } from '../db/index.js';
import { eq, and, lte, gte, gt, lt, count, isNotNull, isNull } from 'drizzle-orm';
import { formatDate, addDaysToDate, daysUntilExpiry, getDomainStatus, DomainStatus } from '../utils/dates.js';
import { ReportConfig } from '../db/schema.js';
import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR = path.join(__dirname, '..', '..', 'src', 'fonts', 'Roboto-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', '..', 'src', 'fonts', 'Roboto-Bold.ttf');

export interface DashboardStats {
  totalClients: number;
  totalDomains: number;
  totalActiveDomains: number;
  totalHosting: number;
  totalActiveHosting: number;
  expiringDomains: number;
  expiringHosting: number;
  expiredCount: number;
  forDeletionCount: number;
  willBeDeletedCount: number;
}

export interface ExpiringItem {
  id: number;
  domainId: number | null;
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
  const sevenDaysAgo = addDaysToDate(new Date(), -7);

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
    expiredWebResult,
    expiredMailResult,
    forDeletionWebResult,
    forDeletionMailResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(schema.clients),
    db.select({ count: count() }).from(schema.domains),
    db.select({ count: count() }).from(schema.domains).where(and(eq(schema.domains.isActive, true), gte(schema.domains.expiryDate, today))),
    db.select({ count: count() }).from(schema.webHosting).where(isNotNull(schema.webHosting.domainId)),
    db.select({ count: count() }).from(schema.mailHosting).where(isNotNull(schema.mailHosting.domainId)),
    db.select({ count: count() }).from(schema.webHosting).where(and(isNotNull(schema.webHosting.domainId), gte(schema.webHosting.expiryDate, today))),
    db.select({ count: count() }).from(schema.mailHosting).where(and(isNotNull(schema.mailHosting.domainId), gte(schema.mailHosting.expiryDate, today))),
    db.select({ count: count() }).from(schema.domains).where(and(
      gte(schema.domains.expiryDate, today),
      lte(schema.domains.expiryDate, thirtyDaysLater)
    )),
    db.select({ count: count() }).from(schema.webHosting).where(and(
      isNotNull(schema.webHosting.domainId),
      gte(schema.webHosting.expiryDate, today),
      lte(schema.webHosting.expiryDate, thirtyDaysLater)
    )),
    db.select({ count: count() }).from(schema.mailHosting).where(and(
      isNotNull(schema.mailHosting.domainId),
      gte(schema.mailHosting.expiryDate, today),
      lte(schema.mailHosting.expiryDate, thirtyDaysLater)
    )),
    // Will be deleted: expired more than 60 days ago
    db.select({ count: count() }).from(schema.webHosting).where(and(isNotNull(schema.webHosting.domainId), lte(schema.webHosting.expiryDate, sixtyDaysAgo))),
    db.select({ count: count() }).from(schema.mailHosting).where(and(isNotNull(schema.mailHosting.domainId), lte(schema.mailHosting.expiryDate, sixtyDaysAgo))),
    // Expired: 0 to 7 days ago
    db.select({ count: count() }).from(schema.webHosting).where(and(isNotNull(schema.webHosting.domainId), lt(schema.webHosting.expiryDate, today), gt(schema.webHosting.expiryDate, sevenDaysAgo))),
    db.select({ count: count() }).from(schema.mailHosting).where(and(isNotNull(schema.mailHosting.domainId), lt(schema.mailHosting.expiryDate, today), gt(schema.mailHosting.expiryDate, sevenDaysAgo))),
    // For Deletion: 7 to 60 days ago
    db.select({ count: count() }).from(schema.webHosting).where(and(isNotNull(schema.webHosting.domainId), lte(schema.webHosting.expiryDate, sevenDaysAgo), gt(schema.webHosting.expiryDate, sixtyDaysAgo))),
    db.select({ count: count() }).from(schema.mailHosting).where(and(isNotNull(schema.mailHosting.domainId), lte(schema.mailHosting.expiryDate, sevenDaysAgo), gt(schema.mailHosting.expiryDate, sixtyDaysAgo))),
  ]);

  return {
    totalClients: clientsResult[0].count,
    totalDomains: domainsResult[0].count,
    totalActiveDomains: activeDomainsResult[0].count,
    totalHosting: webHostingResult[0].count + mailHostingResult[0].count,
    totalActiveHosting: activeWebHostingResult[0].count + activeMailHostingResult[0].count,
    expiringDomains: expiringDomainsResult[0].count,
    expiringHosting: expiringWebHostingResult[0].count + expiringMailHostingResult[0].count,
    expiredCount: expiredWebResult[0].count + expiredMailResult[0].count,
    forDeletionCount: forDeletionWebResult[0].count + forDeletionMailResult[0].count,
    willBeDeletedCount: willBeDeletedWebResult[0].count + willBeDeletedMailResult[0].count,
  };
}

export async function getExpiringItems(days: number = 30): Promise<ExpiringItem[]> {
  const today = formatDate(new Date());
  const futureDate = addDaysToDate(new Date(), days);

  const mail = await db.select({
    id: schema.mailHosting.id,
    domainId: schema.mailHosting.domainId,
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
    gt(schema.mailHosting.expiryDate, today),
    lte(schema.mailHosting.expiryDate, futureDate)
  ));

  const items: ExpiringItem[] = mail.filter(m => m.domainId != null).map(m => ({
    id: m.id,
    domainId: m.domainId,
    type: 'mail' as const,
    name: m.domainName || m.packageName || 'Hosting',
    clientName: m.clientName,
    expiryDate: m.expiryDate,
    daysUntilExpiry: daysUntilExpiry(m.expiryDate),
  }));

  return items.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

export async function getExpiredItems(): Promise<ExpiringItem[]> {
  const today = formatDate(new Date());
  const sevenDaysAgo = addDaysToDate(new Date(), -7);

  const mail = await db.select({
    id: schema.mailHosting.id,
    domainId: schema.mailHosting.domainId,
    expiryDate: schema.mailHosting.expiryDate,
    clientName: schema.clients.name,
    domainName: schema.domains.domainName,
    packageName: schema.mailPackages.name,
  })
  .from(schema.mailHosting)
  .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
  .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
  .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id))
  .where(and(lte(schema.mailHosting.expiryDate, today), gt(schema.mailHosting.expiryDate, sevenDaysAgo)));

  const items: ExpiringItem[] = mail.filter(m => m.domainId != null).map(m => ({
    id: m.id,
    domainId: m.domainId,
    type: 'mail' as const,
    name: m.domainName || m.packageName || 'Hosting',
    clientName: m.clientName,
    expiryDate: m.expiryDate,
    daysUntilExpiry: daysUntilExpiry(m.expiryDate),
  }));

  return items.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

export async function getForDeletionItems(): Promise<ExpiringItem[]> {
  const sevenDaysAgo = addDaysToDate(new Date(), -7);
  const sixtyDaysAgo = addDaysToDate(new Date(), -60);

  const mail = await db.select({
    id: schema.mailHosting.id,
    domainId: schema.mailHosting.domainId,
    expiryDate: schema.mailHosting.expiryDate,
    clientName: schema.clients.name,
    domainName: schema.domains.domainName,
    packageName: schema.mailPackages.name,
  })
  .from(schema.mailHosting)
  .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
  .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
  .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id))
  .where(and(lte(schema.mailHosting.expiryDate, sevenDaysAgo), gt(schema.mailHosting.expiryDate, sixtyDaysAgo)));

  const items: ExpiringItem[] = mail.filter(m => m.domainId != null).map(m => ({
    id: m.id,
    domainId: m.domainId,
    type: 'mail' as const,
    name: m.domainName || m.packageName || 'Hosting',
    clientName: m.clientName,
    expiryDate: m.expiryDate,
    daysUntilExpiry: daysUntilExpiry(m.expiryDate),
  }));

  return items.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

export async function getWillBeDeletedItems(): Promise<ExpiringItem[]> {
  const sixtyDaysAgo = addDaysToDate(new Date(), -60);

  const mail = await db.select({
    id: schema.mailHosting.id,
    domainId: schema.mailHosting.domainId,
    expiryDate: schema.mailHosting.expiryDate,
    clientName: schema.clients.name,
    domainName: schema.domains.domainName,
    packageName: schema.mailPackages.name,
  })
  .from(schema.mailHosting)
  .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
  .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
  .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id))
  .where(lte(schema.mailHosting.expiryDate, sixtyDaysAgo));

  const items: ExpiringItem[] = mail.filter(m => m.domainId != null).map(m => ({
    id: m.id,
    domainId: m.domainId,
    type: 'mail' as const,
    name: m.domainName || m.packageName || 'Hosting',
    clientName: m.clientName,
    expiryDate: m.expiryDate,
    daysUntilExpiry: daysUntilExpiry(m.expiryDate),
  }));

  // Sort by expiry date ascending (most overdue first, which is most negative daysUntilExpiry)
  return items.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

/** Domains with 20-60 days until hosting expiry that have no PDF uploaded */
export async function getMissingOffers(): Promise<ExpiringItem[]> {
  const twentyDaysLater = addDaysToDate(new Date(), 20);
  const sixtyDaysLater = addDaysToDate(new Date(), 60);

  const mail = await db.select({
    id: schema.mailHosting.id,
    domainId: schema.mailHosting.domainId,
    expiryDate: schema.mailHosting.expiryDate,
    clientName: schema.clients.name,
    domainName: schema.domains.domainName,
    pdfFilename: schema.domains.pdfFilename,
  })
  .from(schema.mailHosting)
  .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
  .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
  .where(and(
    isNotNull(schema.mailHosting.domainId),
    gte(schema.mailHosting.expiryDate, twentyDaysLater),
    lte(schema.mailHosting.expiryDate, sixtyDaysLater),
    isNull(schema.domains.pdfFilename)
  ));

  return mail.map(m => ({
    id: m.id,
    domainId: m.domainId,
    type: 'mail' as const,
    name: m.domainName || 'Hosting',
    clientName: m.clientName,
    expiryDate: m.expiryDate,
    daysUntilExpiry: daysUntilExpiry(m.expiryDate),
  })).sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

export async function getRecentActivity(limit: number = 10) {
  const notifications = await db.select()
    .from(schema.notificationLog)
    .orderBy(schema.notificationLog.sentAt)
    .limit(limit);

  return notifications;
}

// Status colors for HTML table — bg is full color, bgLight is 12% opacity version for group background
const statusColors: Record<DomainStatus, { bg: string; bgLight: string; text: string; label: string; description: string }> = {
  green: { bg: '#dcfce7', bgLight: 'rgba(34,197,94,0.12)', text: '#166534', label: 'OK', description: 'Active — more than 31 days to expiry' },
  yellow: { bg: '#fef9c3', bgLight: 'rgba(234,179,8,0.12)', text: '#854d0e', label: 'Warning', description: '31–8 days to expiry' },
  orange: { bg: '#ffedd5', bgLight: 'rgba(249,115,22,0.12)', text: '#c2410c', label: 'Critical', description: '7–1 days to expiry' },
  red: { bg: '#fee2e2', bgLight: 'rgba(239,68,68,0.12)', text: '#dc2626', label: 'Expired', description: 'Expired 0–30 days' },
  forDeletion: { bg: '#f3e8ff', bgLight: 'rgba(139,92,246,0.12)', text: '#7c3aed', label: 'For Deletion', description: 'Expired 30–60 days' },
  deleted: { bg: '#f3f4f6', bgLight: 'rgba(107,114,128,0.12)', text: '#6b7280', label: 'Deleted', description: 'Expired 60+ days' },
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
  const items = await getHostingItems(config);

  if (items.length === 0) {
    return '<p style="color:#6b7280;">No items match the selected filters.</p>';
  }

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const daysText = (d: number) => d > 0 ? `${d}` : d === 0 ? 'Today' : `${Math.abs(d)} expired`;

  const generateRow = (item: HostingItem) => `
    <tr>
      <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${item.domainName || item.packageName || '-'}</td>
      <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${item.clientName || '-'}</td>
      <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:center; font-weight:600; color:${statusColors[item.status].text};">${daysText(item.daysUntilExpiry)}</td>
      <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${formatDisplayDate(item.expiryDate)}</td>
    </tr>`;

  const tableHeader = `
    <thead>
      <tr>
        <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #d1d5db; font-size:12px; color:#374151;">Domain</th>
        <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #d1d5db; font-size:12px; color:#374151;">Client</th>
        <th style="padding:6px 8px; text-align:center; border-bottom:2px solid #d1d5db; font-size:12px; color:#374151;">Days</th>
        <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #d1d5db; font-size:12px; color:#374151;">Expiry Date</th>
      </tr>
    </thead>`;

  // Always group by status in the correct order: green → yellow → orange → red → forDeletion → deleted
  const statusOrder: DomainStatus[] = ['green', 'yellow', 'orange', 'red', 'forDeletion', 'deleted'];
  const grouped = statusOrder
    .filter(status => config.filters.statuses.includes(status))
    .map(status => ({
      status,
      items: items.filter(item => item.status === status),
    }))
    .filter(group => group.items.length > 0);

  let html = '';
  for (const group of grouped) {
    const color = statusColors[group.status];
    html += `
    <div style="margin-bottom:16px; border-radius:6px; overflow:hidden; background:${color.bgLight}; border-left:4px solid ${color.text};">
      <div style="padding:6px 12px; font-size:12px; font-weight:600; color:${color.text};">
        ${color.label} — ${color.description} (${group.items.length})
      </div>
      <table style="width:100%; border-collapse:collapse; background:rgba(255,255,255,0.6);">
        ${tableHeader}
        <tbody>
          ${group.items.map(generateRow).join('')}
        </tbody>
      </table>
    </div>`;
  }
  return html;
}

// Extract hosting items for PDF (reuses same query as HTML)
async function getHostingItems(config: ReportConfig): Promise<HostingItem[]> {
  const [webHosting, mailHosting] = await Promise.all([
    db.select({
      id: schema.webHosting.id,
      packageName: schema.webHosting.packageName,
      expiryDate: schema.webHosting.expiryDate,
      isEnabled: schema.webHosting.isEnabled,
      clientName: schema.clients.name,
      domainName: schema.domains.domainName,
      domainIsActive: schema.domains.isActive,
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
      domainIsActive: schema.domains.isActive,
      packageName: schema.mailPackages.name,
    })
    .from(schema.mailHosting)
    .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
    .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id)),
  ]);

  const items: HostingItem[] = [
    ...webHosting.filter(h => h.domainIsActive !== false).map(h => {
      const days = daysUntilExpiry(h.expiryDate);
      return { id: h.id, type: 'web' as const, domainName: h.domainName, clientName: h.clientName, expiryDate: h.expiryDate, daysUntilExpiry: days, status: getDomainStatus(days), packageName: h.packageName, isEnabled: h.isEnabled !== false };
    }),
    ...mailHosting.filter(m => m.domainIsActive !== false).map(m => {
      const days = daysUntilExpiry(m.expiryDate);
      return { id: m.id, type: 'mail' as const, domainName: m.domainName, clientName: m.clientName, expiryDate: m.expiryDate, daysUntilExpiry: days, status: getDomainStatus(days), packageName: m.packageName, isEnabled: m.isActive !== false };
    }),
  ];

  const filtered = items.filter(item => config.filters.statuses.includes(item.status));

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (config.sorting.field) {
      case 'domainName': cmp = (a.domainName || '').localeCompare(b.domainName || ''); break;
      case 'clientName': cmp = (a.clientName || '').localeCompare(b.clientName || ''); break;
      case 'expiryDate': cmp = a.daysUntilExpiry - b.daysUntilExpiry; break;
    }
    return config.sorting.direction === 'asc' ? cmp : -cmp;
  });

  return sorted;
}

// PDF status colors (RGB 0-1 for pdfkit)
const pdfStatusColors: Record<DomainStatus, { r: number; g: number; b: number }> = {
  green: { r: 0.13, g: 0.77, b: 0.37 },
  yellow: { r: 0.92, g: 0.70, b: 0.03 },
  orange: { r: 0.98, g: 0.45, b: 0.09 },
  red: { r: 0.94, g: 0.27, b: 0.27 },
  forDeletion: { r: 0.55, g: 0.36, b: 0.96 },
  deleted: { r: 0.42, g: 0.45, b: 0.50 },
};

/** Generate a PDF report buffer (in-memory, no file created) */
export async function generateReportPdf(config: ReportConfig): Promise<Buffer> {
  const items = await getHostingItems(config);
  const now = new Date().toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Get system name from settings
  const systemSetting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'system')).get();
  const systemName = (systemSetting?.value as { systemName?: string })?.systemName || 'Hosting Panel';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    doc.registerFont('Roboto', FONT_REGULAR);
    doc.registerFont('Roboto-Bold', FONT_BOLD);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title with system name
    doc.fontSize(11).font('Roboto-Bold').fill('#666').text(systemName, { align: 'center' });
    doc.fontSize(16).font('Roboto-Bold').fill('#111').text('Hosting Report', { align: 'center' });
    doc.fontSize(9).font('Roboto').fill('#666').text(`Generated: ${now}`, { align: 'center' });
    doc.moveDown(1);

    if (items.length === 0) {
      doc.fontSize(11).text('No items match the selected filters.', { align: 'center' });
      doc.end();
      return;
    }

    // 4 columns: Domain, Client, Days, Expiry Date
    const cols = [
      { header: 'Domain', width: 170 },
      { header: 'Client', width: 160 },
      { header: 'Days', width: 55 },
      { header: 'Expiry Date', width: 90 },
    ];
    const tableLeft = 40;
    const tableWidth = cols.reduce((s, c) => s + c.width, 0);
    const rowHeight = 20;
    const headerHeight = 22;
    const fontSize = 9;
    const headerFontSize = 9;
    const pageBottom = doc.page.height - 50;

    const formatDisplayDate = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const daysText = (d: number) => d > 0 ? `${d}` : d === 0 ? 'Today' : `${Math.abs(d)} exp.`;

    const drawTableHeader = () => {
      let x = tableLeft;
      doc.fontSize(headerFontSize).font('Roboto-Bold');
      doc.rect(x, doc.y, tableWidth, headerHeight).fill('#e5e7eb');
      const headerY = doc.y + 5;
      for (const col of cols) {
        doc.fill('#333').text(col.header, x + 4, headerY, { width: col.width - 8, lineBreak: false });
        x += col.width;
      }
      doc.y = headerY + headerHeight - 5;
      doc.x = tableLeft;
    };

    const drawRow = (item: HostingItem, groupColor: { r: number; g: number; b: number }) => {
      if (doc.y + rowHeight > pageBottom) {
        doc.addPage();
        drawTableHeader();
      }
      const y = doc.y;

      // Row background with group color at 10% opacity
      doc.save();
      doc.rect(tableLeft, y, tableWidth, rowHeight)
        .fillOpacity(0.10).fillColor([groupColor.r * 255, groupColor.g * 255, groupColor.b * 255] as any).fill();
      doc.restore();

      // Bottom border
      doc.save().strokeColor('#e5e7eb').lineWidth(0.5)
        .moveTo(tableLeft, y + rowHeight)
        .lineTo(tableLeft + tableWidth, y + rowHeight)
        .stroke().restore();

      const textY = y + 4;
      let x = tableLeft;
      const values = [
        item.domainName || item.packageName || '-',
        item.clientName || '-',
        daysText(item.daysUntilExpiry),
        formatDisplayDate(item.expiryDate),
      ];

      doc.fontSize(fontSize).font('Roboto-Bold');
      for (let i = 0; i < cols.length; i++) {
        // Days column (index 2) in status color
        if (i === 2) {
          const sc = statusColors[item.status];
          doc.fill(sc.text)
            .text(values[i], x + 4, textY, { width: cols[i].width - 8, lineBreak: false });
        } else {
          doc.fill('#333').text(values[i], x + 4, textY, { width: cols[i].width - 8, lineBreak: false });
        }
        x += cols[i].width;
      }
      doc.y = y + rowHeight;
      doc.x = tableLeft;
    };

    // Always group by status: green → yellow → orange → red → forDeletion → deleted
    const statusOrder: DomainStatus[] = ['green', 'yellow', 'orange', 'red', 'forDeletion', 'deleted'];
    const grouped = statusOrder
      .filter(s => config.filters.statuses.includes(s))
      .map(s => ({ status: s, items: items.filter(i => i.status === s) }))
      .filter(g => g.items.length > 0);

    for (const group of grouped) {
      const color = statusColors[group.status];
      const pdfColor = pdfStatusColors[group.status];
      if (doc.y + headerHeight + rowHeight * 2 + 20 > pageBottom) doc.addPage();

      // Group header with colored background
      const groupHeaderHeight = 16;
      doc.save();
      doc.rect(tableLeft, doc.y, tableWidth, groupHeaderHeight)
        .fillOpacity(0.15).fillColor([pdfColor.r * 255, pdfColor.g * 255, pdfColor.b * 255] as any).fill();
      doc.restore();
      doc.save();
      doc.rect(tableLeft, doc.y, 3, groupHeaderHeight).fill(color.text);
      doc.restore();

      doc.fontSize(8).font('Roboto-Bold').fill(color.text)
        .text(`${color.label} — ${color.description} (${group.items.length})`, tableLeft + 8, doc.y + 3);
      doc.y += groupHeaderHeight + 2;
      doc.x = tableLeft;

      drawTableHeader();
      for (const item of group.items) drawRow(item, pdfColor);
      doc.moveDown(0.5);
    }

    // Footer
    doc.fontSize(7).font('Roboto').fill('#999')
      .text(`Total: ${items.length} items`, tableLeft, doc.y + 10);

    doc.end();
  });
}
