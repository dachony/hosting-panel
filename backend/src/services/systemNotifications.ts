import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { sendEmail } from './email.js';

interface SystemNotificationsSettings {
  enabled: boolean;
  recipientEmail: string;
  events: {
    superadminPasswordChange: boolean;
    adminPasswordChange: boolean;
    userLocked: boolean;
    diskUsageThreshold: boolean;
    diskUsagePercent: number;
    databaseError: boolean;
    applicationError: boolean;
    applicationStart: boolean;
    failedLoginAttempts: boolean;
    failedLoginThreshold: number;
  };
}

// Cache settings to avoid DB queries on every event
let settingsCache: SystemNotificationsSettings | null = null;
let settingsCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

async function getSettings(): Promise<SystemNotificationsSettings | null> {
  const now = Date.now();
  if (settingsCache && now - settingsCacheTime < CACHE_TTL) {
    return settingsCache;
  }

  const setting = await db.select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, 'system-notifications'))
    .get();

  if (!setting?.value) {
    settingsCache = null;
    settingsCacheTime = now;
    return null;
  }

  settingsCache = setting.value as SystemNotificationsSettings;
  settingsCacheTime = now;
  return settingsCache;
}

// Clear cache when settings are updated
export function clearSettingsCache() {
  settingsCache = null;
  settingsCacheTime = 0;
}

async function sendNotification(subject: string, html: string) {
  const settings = await getSettings();
  if (!settings?.enabled || !settings.recipientEmail) {
    return;
  }

  try {
    await sendEmail({
      to: settings.recipientEmail,
      subject: `[System Alert] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc2626; color: white; padding: 15px 20px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0; font-size: 18px;">⚠️ System Notification</h2>
          </div>
          <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            ${html}
            <p style="color: #6b7280; font-size: 12px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
              This is an automated system notification from Hosting Panel.<br>
              Time: ${new Date().toLocaleString('sr-RS')}
            </p>
          </div>
        </div>
      `,
    });
    console.log(`[SystemNotification] Sent: ${subject}`);
  } catch (error) {
    console.error(`[SystemNotification] Failed to send: ${subject}`, error);
  }
}

// Event handlers
export async function notifySuperadminPasswordChange(userName: string, userEmail: string, ipAddress?: string) {
  const settings = await getSettings();
  if (!settings?.enabled || !settings.events.superadminPasswordChange) return;

  await sendNotification(
    'Superadmin Password Changed',
    `<p style="margin: 0 0 10px 0;"><strong>A superadmin user has changed their password:</strong></p>
     <table style="width: 100%; border-collapse: collapse;">
       <tr><td style="padding: 5px 0; color: #6b7280;">User:</td><td style="padding: 5px 0;"><strong>${userName}</strong></td></tr>
       <tr><td style="padding: 5px 0; color: #6b7280;">Email:</td><td style="padding: 5px 0;">${userEmail}</td></tr>
       ${ipAddress ? `<tr><td style="padding: 5px 0; color: #6b7280;">IP Address:</td><td style="padding: 5px 0; font-family: monospace;">${ipAddress}</td></tr>` : ''}
     </table>`
  );
}

export async function notifyAdminPasswordChange(userName: string, userEmail: string, ipAddress?: string) {
  const settings = await getSettings();
  if (!settings?.enabled || !settings.events.adminPasswordChange) return;

  await sendNotification(
    'Admin Password Changed',
    `<p style="margin: 0 0 10px 0;"><strong>An admin user has changed their password:</strong></p>
     <table style="width: 100%; border-collapse: collapse;">
       <tr><td style="padding: 5px 0; color: #6b7280;">User:</td><td style="padding: 5px 0;"><strong>${userName}</strong></td></tr>
       <tr><td style="padding: 5px 0; color: #6b7280;">Email:</td><td style="padding: 5px 0;">${userEmail}</td></tr>
       ${ipAddress ? `<tr><td style="padding: 5px 0; color: #6b7280;">IP Address:</td><td style="padding: 5px 0; font-family: monospace;">${ipAddress}</td></tr>` : ''}
     </table>`
  );
}

export async function notifyUserLocked(userName: string, userEmail: string, reason: string) {
  const settings = await getSettings();
  if (!settings?.enabled || !settings.events.userLocked) return;

  await sendNotification(
    'User Account Locked',
    `<p style="margin: 0 0 10px 0;"><strong>A user account has been locked:</strong></p>
     <table style="width: 100%; border-collapse: collapse;">
       <tr><td style="padding: 5px 0; color: #6b7280;">User:</td><td style="padding: 5px 0;"><strong>${userName}</strong></td></tr>
       <tr><td style="padding: 5px 0; color: #6b7280;">Email:</td><td style="padding: 5px 0;">${userEmail}</td></tr>
       <tr><td style="padding: 5px 0; color: #6b7280;">Reason:</td><td style="padding: 5px 0; color: #dc2626;">${reason}</td></tr>
     </table>`
  );
}

export async function notifyFailedLoginAttempts(ipAddress: string, attemptCount: number, emails: string[]) {
  const settings = await getSettings();
  if (!settings?.enabled || !settings.events.failedLoginAttempts) return;
  if (attemptCount < settings.events.failedLoginThreshold) return;

  await sendNotification(
    `Multiple Failed Login Attempts (${attemptCount})`,
    `<p style="margin: 0 0 10px 0;"><strong>Multiple failed login attempts detected:</strong></p>
     <table style="width: 100%; border-collapse: collapse;">
       <tr><td style="padding: 5px 0; color: #6b7280;">IP Address:</td><td style="padding: 5px 0; font-family: monospace;"><strong>${ipAddress}</strong></td></tr>
       <tr><td style="padding: 5px 0; color: #6b7280;">Failed Attempts:</td><td style="padding: 5px 0; color: #dc2626;">${attemptCount}</td></tr>
       <tr><td style="padding: 5px 0; color: #6b7280;">Attempted Emails:</td><td style="padding: 5px 0; font-size: 12px;">${emails.slice(0, 5).join(', ') || 'N/A'}</td></tr>
     </table>`
  );
}

export async function notifyDiskUsage(usedPercent: number, usedBytes: number, totalBytes: number) {
  const settings = await getSettings();
  if (!settings?.enabled || !settings.events.diskUsageThreshold) return;
  if (usedPercent < settings.events.diskUsagePercent) return;

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  await sendNotification(
    `High Disk Usage (${usedPercent}%)`,
    `<p style="margin: 0 0 10px 0;"><strong>Disk usage has exceeded the configured threshold:</strong></p>
     <table style="width: 100%; border-collapse: collapse;">
       <tr><td style="padding: 5px 0; color: #6b7280;">Current Usage:</td><td style="padding: 5px 0; color: #dc2626;"><strong>${usedPercent}%</strong></td></tr>
       <tr><td style="padding: 5px 0; color: #6b7280;">Used Space:</td><td style="padding: 5px 0;">${formatBytes(usedBytes)}</td></tr>
       <tr><td style="padding: 5px 0; color: #6b7280;">Total Space:</td><td style="padding: 5px 0;">${formatBytes(totalBytes)}</td></tr>
       <tr><td style="padding: 5px 0; color: #6b7280;">Threshold:</td><td style="padding: 5px 0;">${settings.events.diskUsagePercent}%</td></tr>
     </table>`
  );
}

export async function notifyDatabaseError(error: string, context?: string) {
  const settings = await getSettings();
  if (!settings?.enabled || !settings.events.databaseError) return;

  await sendNotification(
    'Database Error',
    `<p style="margin: 0 0 10px 0;"><strong>A database error has occurred:</strong></p>
     <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 10px; margin: 10px 0;">
       <code style="color: #dc2626; font-size: 12px; word-break: break-all;">${error}</code>
     </div>
     ${context ? `<p style="color: #6b7280; font-size: 12px;">Context: ${context}</p>` : ''}`
  );
}

export async function notifyApplicationError(error: string, stack?: string) {
  const settings = await getSettings();
  if (!settings?.enabled || !settings.events.applicationError) return;

  await sendNotification(
    'Application Error',
    `<p style="margin: 0 0 10px 0;"><strong>An application error has occurred:</strong></p>
     <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 10px; margin: 10px 0;">
       <code style="color: #dc2626; font-size: 12px; word-break: break-all;">${error}</code>
     </div>
     ${stack ? `<details style="margin-top: 10px;"><summary style="cursor: pointer; color: #6b7280; font-size: 12px;">Stack trace</summary><pre style="font-size: 10px; overflow-x: auto; background: #f3f4f6; padding: 10px; border-radius: 4px; margin-top: 5px;">${stack}</pre></details>` : ''}`
  );
}

export async function notifyApplicationStart() {
  const settings = await getSettings();
  if (!settings?.enabled || !settings.events.applicationStart) return;

  await sendNotification(
    'Application Started',
    `<p style="margin: 0 0 10px 0;"><strong>The Hosting Panel application has started successfully.</strong></p>
     <table style="width: 100%; border-collapse: collapse;">
       <tr><td style="padding: 5px 0; color: #6b7280;">Start Time:</td><td style="padding: 5px 0;">${new Date().toLocaleString('sr-RS')}</td></tr>
       <tr><td style="padding: 5px 0; color: #6b7280;">Node Version:</td><td style="padding: 5px 0;">${process.version}</td></tr>
       <tr><td style="padding: 5px 0; color: #6b7280;">Environment:</td><td style="padding: 5px 0;">${process.env.NODE_ENV || 'development'}</td></tr>
     </table>
     <p style="color: #059669; margin-top: 15px;">✅ All systems operational</p>`
  );
}
