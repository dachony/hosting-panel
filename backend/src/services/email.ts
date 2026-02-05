import nodemailer from 'nodemailer';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

const DEFAULT_SMTP: SmtpSettings = {
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '1025'),
  secure: false,
  user: '',
  password: '',
  fromEmail: process.env.SMTP_FROM || 'noreply@hosting-dashboard.local',
  fromName: 'Hosting Panel',
};

async function getSmtpSettings(): Promise<SmtpSettings> {
  try {
    const setting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'mail-settings')).get();
    if (setting?.value) {
      return { ...DEFAULT_SMTP, ...(setting.value as Partial<SmtpSettings>) };
    }
  } catch (e) {
    console.error('Error loading mail settings:', e);
  }
  return DEFAULT_SMTP;
}

async function createTransporter() {
  const settings = await getSmtpSettings();

  const transportConfig: nodemailer.TransportOptions = {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
  } as nodemailer.TransportOptions;

  if (settings.user && settings.password) {
    (transportConfig as any).auth = {
      user: settings.user,
      pass: settings.password,
    };
  }

  return {
    transporter: nodemailer.createTransport(transportConfig),
    from: settings.fromName ? `"${settings.fromName}" <${settings.fromEmail}>` : settings.fromEmail,
  };
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const { transporter, from } = await createTransporter();

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}

export async function sendTestEmail(to: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Hosting Panel - Test Email',
    html: `
      <h1>Test Email</h1>
      <p>This is a test email from Hosting Panel application.</p>
      <p>If you see this message, SMTP configuration is working correctly.</p>
      <hr>
      <p><small>Sent: ${new Date().toISOString()}</small></p>
    `,
    text: 'This is a test email from Hosting Panel application. If you see this message, SMTP configuration is working correctly.',
  });
}

export async function testSmtpConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const { transporter } = await createTransporter();
    await transporter.verify();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export function getExpiryNotificationEmail(
  type: 'domain' | 'hosting' | 'mail',
  itemName: string,
  clientName: string,
  expiryDate: string,
  daysUntilExpiry: number
): EmailOptions {
  const typeLabels = {
    domain: 'Domain',
    hosting: 'Web Hosting',
    mail: 'Mail Hosting',
  };

  const typeLabel = typeLabels[type];
  const urgency = daysUntilExpiry <= 3 ? 'URGENT: ' : daysUntilExpiry <= 7 ? 'WARNING: ' : '';

  return {
    to: '',
    subject: `${urgency}${typeLabel} expires in ${daysUntilExpiry} days - ${itemName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${daysUntilExpiry <= 3 ? '#dc2626' : daysUntilExpiry <= 7 ? '#f59e0b' : '#2563eb'};">
          ${typeLabel} expiring soon
        </h2>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Item:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${itemName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Client:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${clientName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Expiry Date:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${expiryDate}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Days until expiry:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: ${daysUntilExpiry <= 3 ? '#dc2626' : daysUntilExpiry <= 7 ? '#f59e0b' : '#2563eb'}; font-weight: bold;">
              ${daysUntilExpiry}
            </td>
          </tr>
        </table>

        <p style="color: #6b7280; font-size: 14px;">
          Please take appropriate action before expiry.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

        <p style="color: #9ca3af; font-size: 12px;">
          This message was automatically generated by Hosting Panel.
        </p>
      </div>
    `,
    text: `${typeLabel} expires in ${daysUntilExpiry} days\n\nItem: ${itemName}\nClient: ${clientName}\nExpiry Date: ${expiryDate}\n\nPlease take appropriate action before expiry.`,
  };
}

export function getDailyReportEmail(
  expiringDomains: Array<{ name: string; clientName: string; expiryDate: string; daysUntilExpiry: number }>,
  expiringHosting: Array<{ name: string; clientName: string; expiryDate: string; daysUntilExpiry: number }>,
  expiringMail: Array<{ name: string; clientName: string; expiryDate: string; daysUntilExpiry: number }>
): EmailOptions {
  const formatItems = (items: Array<{ name: string; clientName: string; expiryDate: string; daysUntilExpiry: number }>) => {
    if (items.length === 0) return '<p style="color: #6b7280;">No expiring items.</p>';

    return `
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Item</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Client</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Expires</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Days</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${item.name}</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${item.clientName}</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${item.expiryDate}</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb; color: ${item.daysUntilExpiry <= 3 ? '#dc2626' : item.daysUntilExpiry <= 7 ? '#f59e0b' : '#2563eb'}; font-weight: bold;">
                ${item.daysUntilExpiry}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  };

  return {
    to: '',
    subject: `Hosting Panel - Daily Report (${new Date().toLocaleDateString('en-US')})`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #1f2937;">Daily Report</h1>
        <p style="color: #6b7280;">Overview of services expiring in the next 7 days</p>

        <h2 style="color: #2563eb; margin-top: 30px;">Domains (${expiringDomains.length})</h2>
        ${formatItems(expiringDomains)}

        <h2 style="color: #2563eb; margin-top: 30px;">Web Hosting (${expiringHosting.length})</h2>
        ${formatItems(expiringHosting)}

        <h2 style="color: #2563eb; margin-top: 30px;">Mail Hosting (${expiringMail.length})</h2>
        ${formatItems(expiringMail)}

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

        <p style="color: #9ca3af; font-size: 12px;">
          Generated: ${new Date().toISOString()}<br>
          Hosting Panel
        </p>
      </div>
    `,
    text: `Daily Report - ${new Date().toLocaleDateString('en-US')}\n\nDomains: ${expiringDomains.length}\nWeb Hosting: ${expiringHosting.length}\nMail Hosting: ${expiringMail.length}`,
  };
}
