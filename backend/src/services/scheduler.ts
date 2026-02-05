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
    const schedule = setting.schedule || [];
    const today = new Date();

    for (const days of schedule) {
      const targetDate = formatDate(addDaysToDate(today, days));

      // For client-type notifications, check all service types
      if (setting.type === 'client') {
        await checkExpiringDomains(targetDate, days, setting);
        await checkExpiringHosting(targetDate, days, setting);
        await checkExpiringMailHosting(targetDate, days, setting);
      }
    }
  }

  console.log('[Scheduler] Finished checking expiring items');
}

async function checkExpiringDomains(targetDate: string, daysRemaining: number, setting: typeof schema.notificationSettings.$inferSelect) {
  const domains = await db
    .select({
      id: schema.domains.id,
      domainName: schema.domains.domainName,
      expiryDate: schema.domains.expiryDate,
      clientName: schema.clients.name,
      clientEmail: schema.clients.email1,
      primaryContactName: schema.domains.primaryContactName,
      primaryContactPhone: schema.domains.primaryContactPhone,
      primaryContactEmail: schema.domains.primaryContactEmail,
      techContactName: schema.clients.techContact,
      techContactPhone: schema.clients.techPhone,
      techContactEmail: schema.clients.techEmail,
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
      let emailSubject: string;
      let emailHtml: string;

      if (setting.templateId) {
        const template = await db.select()
          .from(schema.emailTemplates)
          .where(eq(schema.emailTemplates.id, setting.templateId))
          .get();

        if (template) {
          const variables: Record<string, string> = {
            clientName: domain.clientName || 'Nepoznat',
            domainName: domain.domainName,
            expiryDate: domain.expiryDate || '',
            daysUntilExpiry: String(daysRemaining),
            primaryContactName: domain.primaryContactName || '',
            primaryContactPhone: domain.primaryContactPhone || '',
            primaryContactEmail: domain.primaryContactEmail || '',
            techContactName: domain.techContactName || '',
            techContactPhone: domain.techContactPhone || '',
            techContactEmail: domain.techContactEmail || '',
          };

          emailSubject = template.subject;
          emailHtml = template.htmlContent;
          for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            emailSubject = emailSubject.replace(regex, value);
            emailHtml = emailHtml.replace(regex, value);
          }
        } else {
          const emailOptions = getExpiryNotificationEmail('domain', domain.domainName, domain.clientName || 'Nepoznat', domain.expiryDate || '', daysRemaining);
          emailSubject = emailOptions.subject;
          emailHtml = emailOptions.html;
        }
      } else {
        const emailOptions = getExpiryNotificationEmail('domain', domain.domainName, domain.clientName || 'Nepoznat', domain.expiryDate || '', daysRemaining);
        emailSubject = emailOptions.subject;
        emailHtml = emailOptions.html;
      }

      await sendEmail({ to: domain.clientEmail, subject: emailSubject, html: emailHtml });

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

async function checkExpiringHosting(targetDate: string, daysRemaining: number, setting: typeof schema.notificationSettings.$inferSelect) {
  const hosting = await db
    .select({
      id: schema.webHosting.id,
      packageName: schema.webHosting.packageName,
      expiryDate: schema.webHosting.expiryDate,
      clientName: schema.clients.name,
      clientEmail: schema.clients.email1,
      domainName: schema.domains.domainName,
      primaryContactName: schema.domains.primaryContactName,
      primaryContactPhone: schema.domains.primaryContactPhone,
      primaryContactEmail: schema.domains.primaryContactEmail,
      techContactName: schema.clients.techContact,
      techContactPhone: schema.clients.techPhone,
      techContactEmail: schema.clients.techEmail,
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
      let emailSubject: string;
      let emailHtml: string;

      if (setting.templateId) {
        const template = await db.select()
          .from(schema.emailTemplates)
          .where(eq(schema.emailTemplates.id, setting.templateId))
          .get();

        if (template) {
          const variables: Record<string, string> = {
            clientName: item.clientName || 'Nepoznat',
            domainName: item.domainName || '',
            expiryDate: item.expiryDate,
            daysUntilExpiry: String(daysRemaining),
            packageName: item.packageName,
            primaryContactName: item.primaryContactName || '',
            primaryContactPhone: item.primaryContactPhone || '',
            primaryContactEmail: item.primaryContactEmail || '',
            techContactName: item.techContactName || '',
            techContactPhone: item.techContactPhone || '',
            techContactEmail: item.techContactEmail || '',
          };

          emailSubject = template.subject;
          emailHtml = template.htmlContent;
          for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            emailSubject = emailSubject.replace(regex, value);
            emailHtml = emailHtml.replace(regex, value);
          }
        } else {
          const emailOptions = getExpiryNotificationEmail('hosting', itemName, item.clientName || 'Nepoznat', item.expiryDate, daysRemaining);
          emailSubject = emailOptions.subject;
          emailHtml = emailOptions.html;
        }
      } else {
        const emailOptions = getExpiryNotificationEmail('hosting', itemName, item.clientName || 'Nepoznat', item.expiryDate, daysRemaining);
        emailSubject = emailOptions.subject;
        emailHtml = emailOptions.html;
      }

      await sendEmail({ to: item.clientEmail, subject: emailSubject, html: emailHtml });

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

async function checkExpiringMailHosting(targetDate: string, daysRemaining: number, setting: typeof schema.notificationSettings.$inferSelect) {
  const mailHosting = await db
    .select({
      id: schema.mailHosting.id,
      expiryDate: schema.mailHosting.expiryDate,
      clientName: schema.clients.name,
      clientEmail: schema.clients.email1,
      domainName: schema.domains.domainName,
      packageName: schema.mailPackages.name,
      packageDescription: schema.mailPackages.description,
      maxMailboxes: schema.mailPackages.maxMailboxes,
      storageGb: schema.mailPackages.storageGb,
      primaryContactName: schema.domains.primaryContactName,
      primaryContactPhone: schema.domains.primaryContactPhone,
      primaryContactEmail: schema.domains.primaryContactEmail,
      techContactName: schema.clients.techContact,
      techContactPhone: schema.clients.techPhone,
      techContactEmail: schema.clients.techEmail,
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
      let emailSubject: string;
      let emailHtml: string;

      if (setting.templateId) {
        const template = await db.select()
          .from(schema.emailTemplates)
          .where(eq(schema.emailTemplates.id, setting.templateId))
          .get();

        if (template) {
          const variables: Record<string, string> = {
            clientName: item.clientName || 'Nepoznat',
            domainName: item.domainName || '',
            expiryDate: item.expiryDate,
            daysUntilExpiry: String(daysRemaining),
            packageName: item.packageName || '',
            packageDescription: item.packageDescription || '',
            maxMailboxes: String(item.maxMailboxes ?? ''),
            storageGb: String(item.storageGb ?? ''),
            primaryContactName: item.primaryContactName || '',
            primaryContactPhone: item.primaryContactPhone || '',
            primaryContactEmail: item.primaryContactEmail || '',
            techContactName: item.techContactName || '',
            techContactPhone: item.techContactPhone || '',
            techContactEmail: item.techContactEmail || '',
          };

          emailSubject = template.subject;
          emailHtml = template.htmlContent;
          for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            emailSubject = emailSubject.replace(regex, value);
            emailHtml = emailHtml.replace(regex, value);
          }
        } else {
          const emailOptions = getExpiryNotificationEmail('mail', itemName, item.clientName || 'Nepoznat', item.expiryDate, daysRemaining);
          emailSubject = emailOptions.subject;
          emailHtml = emailOptions.html;
        }
      } else {
        const emailOptions = getExpiryNotificationEmail('mail', itemName, item.clientName || 'Nepoznat', item.expiryDate, daysRemaining);
        emailSubject = emailOptions.subject;
        emailHtml = emailOptions.html;
      }

      await sendEmail({ to: item.clientEmail, subject: emailSubject, html: emailHtml });

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
      expiryDate: d.expiryDate || '',
      daysUntilExpiry: daysUntilExpiry(d.expiryDate || ''),
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

// Check if a scheduled notification should run now based on frequency settings
function shouldRunNow(setting: { frequency: string | null; dayOfWeek: number | null; dayOfMonth: number | null; runAtTime: string; lastSent: string | null }): boolean {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Check if current time matches runAtTime
  if (currentTime !== setting.runAtTime) return false;

  // Check if already sent today
  if (setting.lastSent) {
    const lastSentDate = setting.lastSent.substring(0, 10); // YYYY-MM-DD
    const todayStr = now.toISOString().substring(0, 10);
    if (lastSentDate === todayStr) return false;
  }

  const frequency = setting.frequency || 'daily';

  if (frequency === 'daily') {
    return true;
  }

  if (frequency === 'weekly') {
    // dayOfWeek: 0=Sunday, 1=Monday, ... 6=Saturday
    const targetDay = setting.dayOfWeek ?? 1; // default Monday
    return now.getDay() === targetDay;
  }

  if (frequency === 'monthly') {
    const targetDay = setting.dayOfMonth ?? 1;
    const today = now.getDate();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    // If target day > last day of month, send on the last day
    if (targetDay > lastDayOfMonth) {
      return today === lastDayOfMonth;
    }
    return today === targetDay;
  }

  return false;
}

// Send report notifications using templates with reportConfig
async function sendReportNotifications() {
  // Get all enabled notification settings of type 'reports' with a template
  const reportSettings = await db.select()
    .from(schema.notificationSettings)
    .where(and(
      eq(schema.notificationSettings.enabled, true),
      eq(schema.notificationSettings.type, 'reports')
    ));

  for (const setting of reportSettings) {
    if (!setting.templateId) continue;
    if (!shouldRunNow(setting)) continue;

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

      // Update lastSent
      await db.update(schema.notificationSettings)
        .set({ lastSent: new Date().toISOString() })
        .where(eq(schema.notificationSettings.id, setting.id));
    } catch (error) {
      console.error(`[Scheduler] Failed to send report notification "${setting.name}" to ${recipient}:`, error);
    }
  }
}

// Send system notifications using templates with systemConfig
async function sendSystemNotifications() {
  // Get all enabled notification settings of type 'system' with a template
  const systemSettings = await db.select()
    .from(schema.notificationSettings)
    .where(and(
      eq(schema.notificationSettings.enabled, true),
      eq(schema.notificationSettings.type, 'system')
    ));

  for (const setting of systemSettings) {
    if (!setting.templateId) continue;
    if (!shouldRunNow(setting)) continue;

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

      // Update lastSent
      await db.update(schema.notificationSettings)
        .set({ lastSent: new Date().toISOString() })
        .where(eq(schema.notificationSettings.id, setting.id));
    } catch (error) {
      console.error(`[Scheduler] Failed to send system notification "${setting.name}" to ${recipient}:`, error);
    }
  }
}

export function startScheduler() {
  // Check expiring items every day at 8:00 AM
  cron.schedule('0 8 * * *', checkExpiringItems);

  // Send daily report at 9:00 AM
  cron.schedule('0 9 * * *', sendDailyReport);

  // Check report notifications every minute (shouldRunNow handles timing)
  cron.schedule('* * * * *', sendReportNotifications);

  // Check system notifications every minute (shouldRunNow handles timing)
  cron.schedule('* * * * *', sendSystemNotifications);

  console.log('[Scheduler] Started notification scheduler');

  // Run initial check on startup (delayed by 10 seconds)
  setTimeout(() => {
    checkExpiringItems().catch(console.error);
  }, 10000);
}

export { checkExpiringItems, sendDailyReport, sendReportNotifications, sendSystemNotifications };
