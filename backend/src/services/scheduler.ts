import cron from 'node-cron';
import { db, schema, ReportConfig, SystemConfig } from '../db/index.js';
import { eq, and, lte, gte } from 'drizzle-orm';
import { sendEmail, getExpiryNotificationEmail, getDailyReportEmail } from './email.js';
import { formatDate, addDaysToDate, daysUntilExpiry } from '../utils/dates.js';
import { generateHostingListHtml, generateReportPdf } from './reports.js';
import { generateSystemInfoHtml } from './system.js';
import { escapeHtml } from '../utils/validation.js';
import fs from 'fs';
import path from 'path';

const PDF_DIR = '/app/data/pdfs';

// Keys that contain pre-rendered HTML and should NOT be escaped
const HTML_VARIABLE_KEYS = new Set(['hostingList', 'systemInfo', 'companyLogo']);

/** Escape text variables for safe HTML insertion, skip known HTML variables */
function escapeVariables(variables: Record<string, string>): Record<string, string> {
  const escaped: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    escaped[key] = HTML_VARIABLE_KEYS.has(key) ? value : escapeHtml(value);
  }
  return escaped;
}

/** Replace {{key}} placeholders in template subject/html with escaped variables */
function applyTemplateVariables(subject: string, html: string, variables: Record<string, string>): { subject: string; html: string } {
  const escaped = escapeVariables(variables);
  for (const [key, value] of Object.entries(escaped)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    subject = subject.replace(regex, value);
    html = html.replace(regex, value);
  }
  return { subject, html };
}

/** Resolve a recipient entry to an actual email address */
function resolveRecipientEmail(
  entry: { type: 'variable' | 'custom'; value: string },
  context: { clientEmail?: string | null; clientTechEmail?: string | null; domainPrimaryEmail?: string | null; domainTechEmail?: string | null }
): string | null {
  if (entry.type === 'custom') return entry.value;
  switch (entry.value) {
    case 'clientPrimaryContact': return context.clientEmail || null;
    case 'clientTechContact': return context.clientTechEmail || null;
    case 'domainPrimaryContact': return context.domainPrimaryEmail || null;
    case 'domainTechContact': return context.domainTechEmail || null;
    default: return null;
  }
}

function getDomainPdfAttachment(domainId: number, pdfFilename: string | null): Array<{ filename: string; path: string }> {
  if (!pdfFilename) return [];
  const filePath = path.join(PDF_DIR, `${domainId}_${pdfFilename}`);
  if (!fs.existsSync(filePath)) return [];
  return [{ filename: pdfFilename, path: filePath }];
}

async function checkExpiringItems() {
  console.log('[Scheduler] Checking expiring items...');

  const notificationSettings = await db.select().from(schema.notificationSettings).where(eq(schema.notificationSettings.enabled, true));

  for (const setting of notificationSettings) {
    const schedule = setting.schedule || [];
    const today = new Date();

    for (const days of schedule) {
      const targetDate = formatDate(addDaysToDate(today, days));

      // For client-type notifications, check hosting expiry
      if (setting.type === 'client') {
        await checkExpiringMailHosting(targetDate, days, setting);
      }
    }
  }

  console.log('[Scheduler] Finished checking expiring items');
}

async function checkExpiringMailHosting(targetDate: string, daysRemaining: number, setting: typeof schema.notificationSettings.$inferSelect) {
  const mailHosting = await db
    .select({
      id: schema.mailHosting.id,
      expiryDate: schema.mailHosting.expiryDate,
      clientName: schema.clients.name,
      clientEmail: schema.clients.email1,
      clientTechEmail: schema.clients.techEmail,
      domainId: schema.domains.id,
      domainName: schema.domains.domainName,
      domainPdfFilename: schema.domains.pdfFilename,
      packageName: schema.mailPackages.name,
      packageDescription: schema.mailPackages.description,
      maxMailboxes: schema.mailPackages.maxMailboxes,
      storageGb: schema.mailPackages.storageGb,
      primaryContactName: schema.domains.primaryContactName,
      primaryContactPhone: schema.domains.primaryContactPhone,
      primaryContactEmail: schema.domains.primaryContactEmail,
      techContactName: schema.domains.contactEmail1,
      techContactPhone: schema.domains.contactEmail2,
      techContactEmail: schema.domains.contactEmail3,
    })
    .from(schema.mailHosting)
    .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
    .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id))
    .where(eq(schema.mailHosting.expiryDate, targetDate));

  for (const item of mailHosting) {
    // Resolve recipient context for template-based recipients
    const recipientContext = {
      clientEmail: item.clientEmail,
      clientTechEmail: item.clientTechEmail,
      domainPrimaryEmail: item.primaryContactEmail,
      domainTechEmail: item.techContactEmail,
    };

    let recipientEmail: string | null = null;
    let ccEmail: string | null = null;

    // Check if template has recipients defined - if so, use those instead of notification setting logic
    let template: typeof schema.emailTemplates.$inferSelect | undefined;
    if (setting.templateId) {
      template = await db.select()
        .from(schema.emailTemplates)
        .where(eq(schema.emailTemplates.id, setting.templateId))
        .get();
    }

    const templateRecipients = template?.recipients as { to: Array<{type: 'variable'|'custom'; value: string}>; cc: Array<{type: 'variable'|'custom'; value: string}> } | null;

    if (templateRecipients && templateRecipients.to.length > 0) {
      // Resolve To from template recipients (use first resolved)
      for (const entry of templateRecipients.to) {
        const resolved = resolveRecipientEmail(entry, recipientContext);
        if (resolved) { recipientEmail = resolved; break; }
      }
      // Resolve Cc
      if (templateRecipients.cc.length > 0) {
        const ccEmails: string[] = [];
        for (const entry of templateRecipients.cc) {
          const resolved = resolveRecipientEmail(entry, recipientContext);
          if (resolved && resolved !== recipientEmail) ccEmails.push(resolved);
        }
        if (ccEmails.length > 0) ccEmail = ccEmails.join(', ');
      }
    } else {
      // Fallback to notification setting logic
      recipientEmail = setting.recipientType === 'custom'
        ? setting.customEmail
        : (item.primaryContactEmail || item.clientEmail);
    }

    if (!recipientEmail) continue;

    const alreadySent = await db.select()
      .from(schema.notificationLog)
      .where(and(
        eq(schema.notificationLog.type, 'mail'),
        eq(schema.notificationLog.referenceId, item.id),
        eq(schema.notificationLog.recipient, recipientEmail)
      ))
      .get();

    if (alreadySent) continue;

    try {
      const itemName = item.domainName || item.packageName || 'Mail hosting';
      let emailSubject: string;
      let emailHtml: string;
      let mailAttachments: Array<{ filename: string; path: string }> = [];

      if (template) {
        const hasPdf = !!(template.attachDomainPdf && item.domainId && item.domainPdfFilename);
        const variables: Record<string, string> = {
          clientName: item.clientName || 'Nepoznat',
          domainName: item.domainName || '',
          hostingExpiryDate: item.expiryDate,
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
          attachedPdf: hasPdf ? 'Da' : 'Ne',
        };

        const result = applyTemplateVariables(template.subject, template.htmlContent, variables);
        emailSubject = result.subject;
        emailHtml = result.html;

        if (template.attachDomainPdf && item.domainId) {
          mailAttachments = getDomainPdfAttachment(item.domainId, item.domainPdfFilename);
        }
      } else {
        const emailOptions = getExpiryNotificationEmail('hosting', itemName, item.clientName || 'Nepoznat', item.expiryDate, daysRemaining);
        emailSubject = emailOptions.subject;
        emailHtml = emailOptions.html;
      }

      await sendEmail({ to: recipientEmail, cc: ccEmail || undefined, subject: emailSubject, html: emailHtml, attachments: mailAttachments.length > 0 ? mailAttachments : undefined });

      await db.insert(schema.notificationLog).values({
        type: 'mail',
        referenceId: item.id,
        recipient: recipientEmail,
        status: 'sent',
      });

      console.log(`[Scheduler] Sent mail hosting expiry notification for ${itemName} to ${recipientEmail}`);
    } catch (error) {
      await db.insert(schema.notificationLog).values({
        type: 'mail',
        referenceId: item.id,
        recipient: recipientEmail,
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

  const expiringHosting = await db
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
    [],
    [],
    expiringHosting.map(m => ({
      name: m.domainName || m.packageName || 'Hosting',
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
  const frequency = setting.frequency || 'daily';

  if (frequency === 'hourly') {
    // For hourly: only check minutes from runAtTime, ignore hours
    const targetMinute = parseInt(setting.runAtTime.split(':')[1] || '0');
    if (now.getMinutes() !== targetMinute) return false;
    // Idempotency: check if already sent this hour
    if (setting.lastSent) {
      const lastSent = new Date(setting.lastSent);
      if (lastSent.getFullYear() === now.getFullYear() &&
          lastSent.getMonth() === now.getMonth() &&
          lastSent.getDate() === now.getDate() &&
          lastSent.getHours() === now.getHours()) return false;
    }
    return true;
  }

  // For daily/weekly/monthly: check full HH:MM match
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (currentTime !== setting.runAtTime) return false;

  // Check if already sent today
  if (setting.lastSent) {
    const lastSentDate = setting.lastSent.substring(0, 10); // YYYY-MM-DD
    const todayStr = now.toISOString().substring(0, 10);
    if (lastSentDate === todayStr) return false;
  }

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
    const { subject, html } = applyTemplateVariables(template.subject, template.htmlContent, variables);

    // Generate PDF attachment if enabled
    const attachments: Array<{ filename: string; content: Buffer }> = [];
    if (template.sendAsPdf && template.reportConfig) {
      try {
        const pdfBuffer = await generateReportPdf(template.reportConfig as ReportConfig);
        const dateStr = new Date().toISOString().slice(0, 10);
        attachments.push({ filename: `hosting-report-${dateStr}.pdf`, content: pdfBuffer });
        console.log(`[Scheduler] Generated report PDF (${(pdfBuffer.length / 1024).toFixed(1)}KB)`);
      } catch (pdfError) {
        console.error(`[Scheduler] Failed to generate report PDF:`, pdfError);
      }
    }

    try {
      await sendEmail({
        to: recipient,
        subject,
        html,
        attachments: attachments.length > 0 ? attachments : undefined,
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
    const { subject, html } = applyTemplateVariables(template.subject, template.htmlContent, variables);

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

// Send service_request/sales_request notifications using templates
async function sendScheduledNotifications(type: 'service_request' | 'sales_request') {
  const settings = await db.select()
    .from(schema.notificationSettings)
    .where(and(
      eq(schema.notificationSettings.enabled, true),
      eq(schema.notificationSettings.type, type)
    ));

  for (const setting of settings) {
    if (!setting.templateId) continue;
    if (!setting.frequency) continue;
    if (!shouldRunNow(setting)) continue;

    const template = await db.select()
      .from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.id, setting.templateId))
      .get();

    if (!template || !template.isActive) continue;

    let recipient: string | null = null;
    if (setting.recipientType === 'custom' && setting.customEmail) {
      recipient = setting.customEmail;
    }

    if (!recipient) continue;

    const companyInfo = await db.select().from(schema.companyInfo).get();

    const variables: Record<string, string> = {
      companyName: companyInfo?.name || 'Hosting Panel',
      companyLogo: companyInfo?.logo || '',
    };

    const { subject, html } = applyTemplateVariables(template.subject, template.htmlContent, variables);

    try {
      await sendEmail({ to: recipient, subject, html });
      console.log(`[Scheduler] Sent ${type} notification "${setting.name}" to ${recipient}`);

      await db.update(schema.notificationSettings)
        .set({ lastSent: new Date().toISOString() })
        .where(eq(schema.notificationSettings.id, setting.id));
    } catch (error) {
      console.error(`[Scheduler] Failed to send ${type} notification "${setting.name}" to ${recipient}:`, error);
    }
  }
}

// Run scheduled backup based on backupSchedule settings
async function runScheduledBackup() {
  try {
    const setting = await db.select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, 'backupSchedule'))
      .get();

    if (!setting?.value) return;

    const config = setting.value as {
      schedule: { enabled: boolean; frequency: string; time: string; dayOfWeek?: number; dayOfMonth?: number };
      password?: string;
      notifications: { enabled: boolean; email: string };
      retention: { enabled: boolean; days: number };
      _lastRun?: string;
    };

    if (!config.schedule.enabled) return;

    // Use shouldRunNow to check timing
    const shouldRun = shouldRunNow({
      frequency: config.schedule.frequency,
      dayOfWeek: config.schedule.dayOfWeek ?? null,
      dayOfMonth: config.schedule.dayOfMonth ?? null,
      runAtTime: config.schedule.time,
      lastSent: config._lastRun || null,
    });

    if (!shouldRun) return;

    console.log('[Scheduler] Running scheduled backup...');

    // Dynamic import to avoid circular dependency
    const { createServerBackup, cleanupOldBackups } = await import('./backupService.js');

    const backupPassword = config.password || undefined;
    const result = await createServerBackup(backupPassword);
    console.log(`[Scheduler] Backup created: ${result.filename} (${result.size} bytes)`);

    // Run retention cleanup if enabled
    if (config.retention.enabled && config.retention.days > 0) {
      const deleted = cleanupOldBackups(config.retention.days);
      if (deleted > 0) {
        console.log(`[Scheduler] Cleaned up ${deleted} old backup(s)`);
      }
    }

    // Update _lastRun
    const updated = { ...config, _lastRun: new Date().toISOString() };
    await db.update(schema.appSettings)
      .set({ value: updated })
      .where(eq(schema.appSettings.key, 'backupSchedule'));

    // Send notification if enabled
    if (config.notifications.enabled && config.notifications.email) {
      try {
        await sendEmail({
          to: config.notifications.email,
          subject: 'Backup Completed',
          html: `<p>Automatic backup completed successfully.</p><p><strong>File:</strong> ${escapeHtml(result.filename)}<br><strong>Size:</strong> ${(result.size / 1024).toFixed(1)} KB<br><strong>Time:</strong> ${result.createdAt}</p>`,
        });
      } catch (emailError) {
        console.error('[Scheduler] Failed to send backup notification:', emailError);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Scheduled backup failed:', error);

    // Try to send failure notification
    try {
      const setting = await db.select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.key, 'backupSchedule'))
        .get();

      const config = setting?.value as { notifications?: { enabled: boolean; email: string } } | null;
      if (config?.notifications?.enabled && config.notifications.email) {
        await sendEmail({
          to: config.notifications.email,
          subject: 'Backup Failed',
          html: `<p>Automatic backup failed.</p><p><strong>Error:</strong> ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`,
        });
      }
    } catch {
      // Ignore notification send failure
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

  // Check service_request/sales_request notifications every minute
  cron.schedule('* * * * *', () => sendScheduledNotifications('service_request'));
  cron.schedule('* * * * *', () => sendScheduledNotifications('sales_request'));

  // Check scheduled backups every minute (shouldRunNow handles timing)
  cron.schedule('* * * * *', runScheduledBackup);

  console.log('[Scheduler] Started notification scheduler');

  // Run initial check on startup (delayed by 10 seconds)
  setTimeout(() => {
    checkExpiringItems().catch(console.error);
  }, 10000);
}

// Trigger a single client notification setting (used by manual "Trigger Now")
// Unlike the scheduled check, this finds ALL items within the schedule range
// and sends individual emails without checking notificationLog for duplicates.
async function triggerClientNotification(setting: typeof schema.notificationSettings.$inferSelect, domainId?: number): Promise<number> {
  const schedule = setting.schedule || [];
  if (schedule.length === 0) return 0;

  if (!setting.templateId) return 0;
  const template = await db.select()
    .from(schema.emailTemplates)
    .where(eq(schema.emailTemplates.id, setting.templateId))
    .get();
  if (!template) return 0;

  const today = new Date();
  const maxDays = Math.max(...schedule);
  const minDays = Math.min(...schedule);

  // Date range: from today+minDays to today+maxDays
  const rangeStart = formatDate(addDaysToDate(today, minDays));
  const rangeEnd = formatDate(addDaysToDate(today, maxDays));

  let sentCount = 0;

  // --- Hosting (mail_hosting) ---
  const mailHosting = await db
    .select({
      id: schema.mailHosting.id,
      expiryDate: schema.mailHosting.expiryDate,
      clientName: schema.clients.name,
      clientEmail: schema.clients.email1,
      clientTechEmail: schema.clients.techEmail,
      domainId: schema.domains.id,
      domainName: schema.domains.domainName,
      domainPdfFilename: schema.domains.pdfFilename,
      packageName: schema.mailPackages.name,
      packageDescription: schema.mailPackages.description,
      maxMailboxes: schema.mailPackages.maxMailboxes,
      storageGb: schema.mailPackages.storageGb,
      primaryContactName: schema.domains.primaryContactName,
      primaryContactPhone: schema.domains.primaryContactPhone,
      primaryContactEmail: schema.domains.primaryContactEmail,
      techContactName: schema.domains.contactEmail1,
      techContactPhone: schema.domains.contactEmail2,
      techContactEmail: schema.domains.contactEmail3,
    })
    .from(schema.mailHosting)
    .leftJoin(schema.clients, eq(schema.mailHosting.clientId, schema.clients.id))
    .leftJoin(schema.domains, eq(schema.mailHosting.domainId, schema.domains.id))
    .leftJoin(schema.mailPackages, eq(schema.mailHosting.mailPackageId, schema.mailPackages.id))
    .where(domainId
      ? eq(schema.mailHosting.domainId, domainId)
      : and(gte(schema.mailHosting.expiryDate, rangeStart), lte(schema.mailHosting.expiryDate, rangeEnd))
    );

  // Template recipients
  const templateRecipients = template.recipients as { to: Array<{type: 'variable'|'custom'; value: string}>; cc: Array<{type: 'variable'|'custom'; value: string}> } | null;

  for (const item of mailHosting) {
    const recipientContext = {
      clientEmail: item.clientEmail,
      clientTechEmail: item.clientTechEmail,
      domainPrimaryEmail: item.primaryContactEmail,
      domainTechEmail: item.techContactEmail,
    };

    let recipientEmail: string | null = null;
    let ccEmail: string | null = null;

    if (templateRecipients && templateRecipients.to.length > 0) {
      for (const entry of templateRecipients.to) {
        const resolved = resolveRecipientEmail(entry, recipientContext);
        if (resolved) { recipientEmail = resolved; break; }
      }
      if (templateRecipients.cc.length > 0) {
        const ccEmails: string[] = [];
        for (const entry of templateRecipients.cc) {
          const resolved = resolveRecipientEmail(entry, recipientContext);
          if (resolved && resolved !== recipientEmail) ccEmails.push(resolved);
        }
        if (ccEmails.length > 0) ccEmail = ccEmails.join(', ');
      }
    } else {
      recipientEmail = setting.recipientType === 'custom'
        ? setting.customEmail
        : (item.primaryContactEmail || item.clientEmail);
    }

    if (!recipientEmail) continue;

    const daysLeft = daysUntilExpiry(item.expiryDate);
    const itemName = item.domainName || item.packageName || 'Mail hosting';

    try {
      const hasPdf = !!(template.attachDomainPdf && item.domainId && item.domainPdfFilename);
      const variables: Record<string, string> = {
        clientName: item.clientName || 'Nepoznat',
        domainName: item.domainName || '',
        hostingExpiryDate: item.expiryDate,
        daysUntilExpiry: String(daysLeft),
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
        attachedPdf: hasPdf ? 'Da' : 'Ne',
      };

      const { subject: emailSubject, html: emailHtml } = applyTemplateVariables(template.subject, template.htmlContent, variables);

      let attachments: Array<{ filename: string; path: string }> = [];
      if (template.attachDomainPdf && item.domainId) {
        attachments = getDomainPdfAttachment(item.domainId, item.domainPdfFilename);
      }

      await sendEmail({ to: recipientEmail, cc: ccEmail || undefined, subject: emailSubject, html: emailHtml, attachments: attachments.length > 0 ? attachments : undefined });
      sentCount++;
      console.log(`[Trigger] Sent hosting notification for ${itemName} to ${recipientEmail}`);
    } catch (error) {
      console.error(`[Trigger] Failed to send mail hosting notification for ${itemName}:`, error);
    }
  }

  console.log(`[Trigger] Client notification trigger complete. Sent ${sentCount} emails.`);
  return sentCount;
}

export { checkExpiringItems, sendDailyReport, sendReportNotifications, sendSystemNotifications, triggerClientNotification };
