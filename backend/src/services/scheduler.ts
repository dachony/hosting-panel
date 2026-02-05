import cron from 'node-cron';
import { db, schema, ReportConfig, SystemConfig } from '../db/index.js';
import { eq, and, lte, gte } from 'drizzle-orm';
import { sendEmail, getExpiryNotificationEmail, getDailyReportEmail } from './email.js';
import { formatDate, addDaysToDate, daysUntilExpiry } from '../utils/dates.js';
import { generateHostingListHtml } from './reports.js';
import { generateSystemInfoHtml } from './system.js';

async function checkExpiringItems() {
  console.log('[Scheduler] Checking expiring items...');

  const notificationSettings = await db.select().from(schema.notificationSettings).where(eq(schema.notificationSettings.enabled, true));

  for (const setting of notificationSettings) {
    const daysBefore = setting.daysBefore as number[];
    const today = new Date();

    for (const days of daysBefore) {
      const targetDate = formatDate(addDaysToDate(today, days));

      if (setting.type === 'domain') {
        await checkExpiringDomains(targetDate, days);
      } else if (setting.type === 'hosting') {
        await checkExpiringHosting(targetDate, days);
      } else if (setting.type === 'mail') {
        await checkExpiringMailHosting(targetDate, days);
      }
    }
  }

  console.log('[Scheduler] Finished checking expiring items');
}

async function checkExpiringDomains(targetDate: string, daysRemaining: number) {
  const domains = await db
    .select({
      id: schema.domains.id,
      domainName: schema.domains.domainName,
      expiryDate: schema.domains.expiryDate,
      clientName: schema.clients.name,
      clientEmail: schema.clients.email1,
    })
    .from(schema.domains)
    .leftJoin(schema.clients, eq(schema.domains.clientId, schema.clients.id))
    .where(eq(schema.domains.expiryDate, targetDate));

  for (const domain of domains) {
    if (!domain.clientEmail) continue;

    const alreadySent = await db.select()
      .from(schema.notificationLog)
      .where(and(
        eq(schema.notificationLog.type, 'domain'),
        eq(schema.notificationLog.referenceId, domain.id),
        eq(schema.notificationLog.recipient, domain.clientEmail)
      ))
      .get();

    if (alreadySent) continue;

    try {
      const emailOptions = getExpiryNotificationEmail(
        'domain',
        domain.domainName,
        domain.clientName || 'Nepoznat',
        domain.expiryDate,
        daysRemaining
      );

      await sendEmail({ ...emailOptions, to: domain.clientEmail });

      await db.insert(schema.notificationLog).values({
        type: 'domain',
        referenceId: domain.id,
        recipient: domain.clientEmail,
        status: 'sent',
      });

      console.log(`[Scheduler] Sent domain expiry notification for ${domain.domainName}`);
    } catch (error) {
      await db.insert(schema.notificationLog).values({
        type: 'domain',
        referenceId: domain.id,
        recipient: domain.clientEmail,
        status: 'failed',
        error: String(error),
      });

      console.error(`[Scheduler] Failed to send notification for ${domain.domainName}:`, error);
    }
  }
}

async function checkExpiringHosting(targetDate: string, daysRemaining: number) {
  const hosting = await db
    .select({
      id: schema.webHosting.id,
      packageName: schema.webHosting.packageName,
      expiryDate: schema.webHosting.expiryDate,
      clientName: schema.clients.name,
      clientEmail: schema.clients.email1,
      domainName: schema.domains.domainName,
    })
    .from(schema.webHosting)
    .leftJoin(schema.clients, eq(schema.webHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.webHosting.domainId, schema.domains.id))
    .where(eq(schema.webHosting.expiryDate, targetDate));

  for (const item of hosting) {
    if (!item.clientEmail) continue;

    const alreadySent = await db.select()
      .from(schema.notificationLog)
      .where(and(
        eq(schema.notificationLog.type, 'hosting'),
        eq(schema.notificationLog.referenceId, item.id),
        eq(schema.notificationLog.recipient, item.clientEmail)
      ))
      .get();

    if (alreadySent) continue;

    try {
      const itemName = item.domainName || item.packageName;
      const emailOptions = getExpiryNotificationEmail(
        'hosting',
        itemName,
        item.clientName || 'Nepoznat',
        item.expiryDate,
        daysRemaining
      );

      await sendEmail({ ...emailOptions, to: item.clientEmail });

      await db.insert(schema.notificationLog).values({
        type: 'hosting',
        referenceId: item.id,
        recipient: item.clientEmail,
        status: 'sent',
      });

      console.log(`[Scheduler] Sent hosting expiry notification for ${itemName}`);
    } catch (error) {
      await db.insert(schema.notificationLog).values({
        type: 'hosting',
        referenceId: item.id,
        recipient: item.clientEmail,
        status: 'failed',
        error: String(error),
      });

      console.error(`[Scheduler] Failed to send notification for ${item.packageName}:`, error);
    }
  }
}

async function checkExpiringMailHosting(targetDate: string, daysRemaining: number) {
  const mailHosting = await db
    .select({
      id: schema.mailHosting.id,
      expiryDate: schema.mailHosting.expiryDate,
      clientName: schema.clients.name,
      clientEmail: schema.clients.email1,
      domainName: schema.domains.domainName,
      packageName: schema.mailPackages.name,
    })
    .from(schema.mailHosting)
    .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
    .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id))
    .where(eq(schema.mailHosting.expiryDate, targetDate));

  for (const item of mailHosting) {
    if (!item.clientEmail) continue;

    const alreadySent = await db.select()
      .from(schema.notificationLog)
      .where(and(
        eq(schema.notificationLog.type, 'mail'),
        eq(schema.notificationLog.referenceId, item.id),
        eq(schema.notificationLog.recipient, item.clientEmail)
      ))
      .get();

    if (alreadySent) continue;

    try {
      const itemName = item.domainName || item.packageName || 'Mail hosting';
      const emailOptions = getExpiryNotificationEmail(
        'mail',
        itemName,
        item.clientName || 'Nepoznat',
        item.expiryDate,
        daysRemaining
      );

      await sendEmail({ ...emailOptions, to: item.clientEmail });

      await db.insert(schema.notificationLog).values({
        type: 'mail',
        referenceId: item.id,
        recipient: item.clientEmail,
        status: 'sent',
      });

      console.log(`[Scheduler] Sent mail hosting expiry notification for ${itemName}`);
    } catch (error) {
      await db.insert(schema.notificationLog).values({
        type: 'mail',
        referenceId: item.id,
        recipient: item.clientEmail,
        status: 'failed',
        error: String(error),
      });

      console.error(`[Scheduler] Failed to send notification for mail hosting:`, error);
    }
  }
}

async function sendDailyReport() {
  console.log('[Scheduler] Sending daily report...');

  const reports = await db.select()
    .from(schema.reportSettings)
    .where(and(
      eq(schema.reportSettings.enabled, true),
      eq(schema.reportSettings.frequency, 'daily')
    ));

  if (reports.length === 0) return;

  const today = formatDate(new Date());
  const weekLater = addDaysToDate(new Date(), 7);

  const expiringDomains = await db
    .select({
      id: schema.domains.id,
      domainName: schema.domains.domainName,
      expiryDate: schema.domains.expiryDate,
      clientName: schema.clients.name,
    })
    .from(schema.domains)
    .leftJoin(schema.clients, eq(schema.domains.clientId, schema.clients.id))
    .where(and(
      gte(schema.domains.expiryDate, today),
      lte(schema.domains.expiryDate, weekLater)
    ));

  const expiringHosting = await db
    .select({
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
      lte(schema.webHosting.expiryDate, weekLater)
    ));

  const expiringMail = await db
    .select({
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
      lte(schema.mailHosting.expiryDate, weekLater)
    ));

  const emailOptions = getDailyReportEmail(
    expiringDomains.map(d => ({
      name: d.domainName,
      clientName: d.clientName || 'Nepoznat',
      expiryDate: d.expiryDate,
      daysUntilExpiry: daysUntilExpiry(d.expiryDate),
    })),
    expiringHosting.map(h => ({
      name: h.domainName || h.packageName,
      clientName: h.clientName || 'Nepoznat',
      expiryDate: h.expiryDate,
      daysUntilExpiry: daysUntilExpiry(h.expiryDate),
    })),
    expiringMail.map(m => ({
      name: m.domainName || m.packageName || 'Mail hosting',
      clientName: m.clientName || 'Nepoznat',
      expiryDate: m.expiryDate,
      daysUntilExpiry: daysUntilExpiry(m.expiryDate),
    }))
  );

  for (const report of reports) {
    const recipients = report.recipients as string[];
    for (const recipient of recipients) {
      try {
        await sendEmail({ ...emailOptions, to: recipient });
        console.log(`[Scheduler] Sent daily report to ${recipient}`);
      } catch (error) {
        console.error(`[Scheduler] Failed to send daily report to ${recipient}:`, error);
      }
    }

    await db.update(schema.reportSettings)
      .set({ lastSent: new Date().toISOString() })
      .where(eq(schema.reportSettings.id, report.id));
  }

  console.log('[Scheduler] Finished sending daily reports');
}

// Send report notifications using templates with reportConfig
async function sendReportNotifications() {
  console.log('[Scheduler] Checking report notifications...');

  // Get all enabled notification settings of type 'reports' with a template
  const reportSettings = await db.select()
    .from(schema.notificationSettings)
    .where(and(
      eq(schema.notificationSettings.enabled, true),
      eq(schema.notificationSettings.type, 'reports')
    ));

  for (const setting of reportSettings) {
    if (!setting.templateId) continue;

    // Load the template
    const template = await db.select()
      .from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.id, setting.templateId))
      .get();

    if (!template || !template.isActive) continue;

    // Determine recipient
    let recipient: string | null = null;
    if (setting.recipientType === 'custom' && setting.customEmail) {
      recipient = setting.customEmail;
    }

    if (!recipient) continue;

    // Get company info for variables
    const companyInfo = await db.select().from(schema.companyInfo).get();

    // Build variables
    const variables: Record<string, string> = {
      companyName: companyInfo?.name || 'Hosting Panel',
      companyLogo: companyInfo?.logo || '',
    };

    // If template has reportConfig, generate hostingList
    if (template.reportConfig) {
      const reportConfig = template.reportConfig as ReportConfig;
      const hostingListHtml = await generateHostingListHtml(reportConfig);
      variables.hostingList = hostingListHtml;
    }

    // Replace variables in template
    let html = template.htmlContent;
    let subject = template.subject;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, value);
      subject = subject.replace(regex, value);
    }

    try {
      await sendEmail({
        to: recipient,
        subject,
        html,
      });
      console.log(`[Scheduler] Sent report notification "${setting.name}" to ${recipient}`);
    } catch (error) {
      console.error(`[Scheduler] Failed to send report notification "${setting.name}" to ${recipient}:`, error);
    }
  }

  console.log('[Scheduler] Finished sending report notifications');
}

// Send system notifications using templates with systemConfig
async function sendSystemNotifications() {
  console.log('[Scheduler] Checking system notifications...');

  // Get all enabled notification settings of type 'system' with a template
  const systemSettings = await db.select()
    .from(schema.notificationSettings)
    .where(and(
      eq(schema.notificationSettings.enabled, true),
      eq(schema.notificationSettings.type, 'system')
    ));

  for (const setting of systemSettings) {
    if (!setting.templateId) continue;

    // Load the template
    const template = await db.select()
      .from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.id, setting.templateId))
      .get();

    if (!template || !template.isActive) continue;

    // Determine recipient
    let recipient: string | null = null;
    if (setting.recipientType === 'custom' && setting.customEmail) {
      recipient = setting.customEmail;
    }

    if (!recipient) continue;

    // Get company info for variables
    const companyInfo = await db.select().from(schema.companyInfo).get();

    // Build variables
    const variables: Record<string, string> = {
      companyName: companyInfo?.name || 'Hosting Panel',
      companyLogo: companyInfo?.logo || '',
    };

    // If template has systemConfig, generate systemInfo
    if (template.systemConfig) {
      const systemConfig = template.systemConfig as SystemConfig;
      const systemInfoHtml = await generateSystemInfoHtml(systemConfig);
      variables.systemInfo = systemInfoHtml;
    }

    // Replace variables in template
    let html = template.htmlContent;
    let subject = template.subject;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, value);
      subject = subject.replace(regex, value);
    }

    try {
      await sendEmail({
        to: recipient,
        subject,
        html,
      });
      console.log(`[Scheduler] Sent system notification "${setting.name}" to ${recipient}`);
    } catch (error) {
      console.error(`[Scheduler] Failed to send system notification "${setting.name}" to ${recipient}:`, error);
    }
  }

  console.log('[Scheduler] Finished sending system notifications');
}

export function startScheduler() {
  // Check expiring items every day at 8:00 AM
  cron.schedule('0 8 * * *', checkExpiringItems);

  // Send daily report at 9:00 AM
  cron.schedule('0 9 * * *', sendDailyReport);

  // Send report notifications at 9:30 AM
  cron.schedule('30 9 * * *', sendReportNotifications);

  // Send system notifications at 10:00 AM
  cron.schedule('0 10 * * *', sendSystemNotifications);

  console.log('[Scheduler] Started notification scheduler');

  // Run initial check on startup (delayed by 10 seconds)
  setTimeout(() => {
    checkExpiringItems().catch(console.error);
  }, 10000);
}

export { checkExpiringItems, sendDailyReport, sendReportNotifications, sendSystemNotifications };
