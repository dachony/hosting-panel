import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(), // Display name (firstName + lastName)
  firstName: text('first_name'),
  lastName: text('last_name'),
  phone: text('phone'),
  role: text('role', { enum: ['superadmin', 'admin', 'salesadmin', 'sales'] }).notNull().default('sales'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).default(false),
  twoFactorMethod: text('two_factor_method', { enum: ['email', 'totp'] }),
  twoFactorSecret: text('two_factor_secret'),
  twoFactorEmailEnabled: integer('two_factor_email_enabled', { mode: 'boolean' }).default(false),
  twoFactorTotpEnabled: integer('two_factor_totp_enabled', { mode: 'boolean' }).default(false),
  lockedUntil: text('locked_until'),
  failedLoginAttempts: integer('failed_login_attempts').default(0),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const clients = sqliteTable('clients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  domain: text('domain'),
  contactPerson: text('contact_person'),
  phone: text('phone'),
  email1: text('email1'),
  email2: text('email2'),
  email3: text('email3'),
  techContact: text('tech_contact'),
  techPhone: text('tech_phone'),
  techEmail: text('tech_email'),
  address: text('address'),
  pib: text('pib'),
  mib: text('mib'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const domains = sqliteTable('domains', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  domainName: text('domain_name').notNull().unique(),
  registrar: text('registrar'),
  registrationDate: text('registration_date'),
  expiryDate: text('expiry_date'),
  autoRenew: integer('auto_renew', { mode: 'boolean' }).default(false),
  primaryContactName: text('primary_contact_name'),
  primaryContactPhone: text('primary_contact_phone'),
  primaryContactEmail: text('primary_contact_email'),
  contactEmail1: text('contact_email1'),
  contactEmail2: text('contact_email2'),
  contactEmail3: text('contact_email3'),
  notes: text('notes'),
  pdfFilename: text('pdf_filename'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mailPackages = sqliteTable('mail_packages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  maxMailboxes: integer('max_mailboxes').notNull().default(5),
  storageGb: real('storage_gb').notNull().default(5),
  price: real('price').notNull().default(0),
  features: text('features', { mode: 'json' }).$type<string[]>(),
  mailServerId: integer('mail_server_id'),
  mailSecurityId: integer('mail_security_id'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const webHosting = sqliteTable('web_hosting', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  domainId: integer('domain_id').references(() => domains.id, { onDelete: 'set null' }),
  mailServerId: integer('mail_server_id'),
  packageName: text('package_name').notNull(),
  server: text('server'),
  startDate: text('start_date'),
  expiryDate: text('expiry_date').notNull(),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mailHosting = sqliteTable('mail_hosting', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  domainId: integer('domain_id').references(() => domains.id, { onDelete: 'set null' }),
  mailPackageId: integer('mail_package_id').references(() => mailPackages.id, { onDelete: 'set null' }),
  startDate: text('start_date'),
  expiryDate: text('expiry_date').notNull(),
  mailboxesCount: integer('mailboxes_count').notNull().default(1),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const notificationSettings = sqliteTable('notification_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().default(''),
  type: text('type', { enum: ['client', 'service_request', 'sales_request', 'reports', 'system'] }).notNull(),
  schedule: text('schedule', { mode: 'json' }).$type<number[]>().notNull().default([30, 14, 7, 1, 0]),
  runAtTime: text('run_at_time').notNull().default('09:00'),
  templateId: integer('template_id').references(() => emailTemplates.id),
  recipientType: text('recipient_type', { enum: ['custom', 'primary'] }).notNull().default('primary'),
  customEmail: text('custom_email'),
  includeTechnical: integer('include_technical', { mode: 'boolean' }).default(false),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  frequency: text('frequency', { enum: ['hourly', 'daily', 'weekly', 'monthly'] }),
  dayOfWeek: integer('day_of_week'),
  dayOfMonth: integer('day_of_month'),
  lastSent: text('last_sent'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const notificationLog = sqliteTable('notification_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['domain', 'hosting', 'mail'] }).notNull(),
  referenceId: integer('reference_id').notNull(),
  sentAt: text('sent_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  recipient: text('recipient').notNull(),
  status: text('status', { enum: ['sent', 'failed'] }).notNull(),
  error: text('error'),
});

export const reportSettings = sqliteTable('report_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  frequency: text('frequency', { enum: ['hourly', 'daily', 'weekly', 'monthly'] }).notNull(),
  recipients: text('recipients', { mode: 'json' }).$type<string[]>().notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  lastSent: text('last_sent'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Report configuration type for report templates
export interface ReportConfig {
  filters: {
    statuses: ('green' | 'yellow' | 'orange' | 'red' | 'forDeletion' | 'deleted')[];
  };
  sorting: {
    field: 'domainName' | 'clientName' | 'expiryDate';
    direction: 'asc' | 'desc';
  };
  groupByStatus: boolean;
}

// System configuration type for system templates
export interface SystemConfig {
  sections: {
    blockedIps: boolean;      // Blocked/banned IP addresses
    lockedUsers: boolean;     // Locked user accounts
    failedLogins: boolean;    // Failed login attempts (Fail2Ban style)
    passwordChanges: boolean; // Password change audit
    resourceUsage: boolean;   // Disk/resource usage
    databaseSize: boolean;    // Database size info
    auditLogs: boolean;       // Audit log count & size
    emailLogs: boolean;       // Email log count & size
    pdfDocuments: boolean;    // PDF documents count & size
  };
  period: 'today' | 'last7days' | 'last30days' | 'all';
  thresholds?: {
    auditLogsCount?: number;
    emailLogsCount?: number;
    pdfSizeMb?: number;
  };
}

export const emailTemplates = sqliteTable('email_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type', { enum: ['client', 'service_request', 'sales_request', 'reports', 'system'] }).notNull(),
  subject: text('subject').notNull(),
  htmlContent: text('html_content').notNull(),
  pdfTemplate: text('pdf_template'),
  variables: text('variables', { mode: 'json' }).$type<string[]>(),
  reportConfig: text('report_config', { mode: 'json' }).$type<ReportConfig | null>(),
  systemConfig: text('system_config', { mode: 'json' }).$type<SystemConfig | null>(),
  attachDomainPdf: integer('attach_domain_pdf', { mode: 'boolean' }).default(false),
  recipients: text('recipients', { mode: 'json' }).$type<{ to: Array<{type: 'variable'|'custom'; value: string}>; cc: Array<{type: 'variable'|'custom'; value: string}> } | null>(),
  headerLogoSize: text('header_logo_size').$type<'small'|'medium'|'large'>().default('medium'),
  headerImageSize: text('header_image_size').$type<'small'|'medium'|'large'>().default('medium'),
  signatureLogoSize: text('signature_logo_size').$type<'small'|'medium'|'large'>().default('medium'),
  footerImageSize: text('footer_image_size').$type<'small'|'medium'|'large'>().default('medium'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value', { mode: 'json' }),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mailServers = sqliteTable('mail_servers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  hostname: text('hostname').notNull(),
  description: text('description'),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mailSecurity = sqliteTable('mail_security', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  hostname: text('hostname').notNull(),
  description: text('description'),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const companyInfo = sqliteTable('company_info', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  logo: text('logo'),
  address: text('address'),
  city: text('city'),
  postalCode: text('postal_code'),
  country: text('country'),
  website: text('website'),
  email: text('email'),
  phone: text('phone'),
  phone2: text('phone2'),
  contactName: text('contact_name'),
  contactPhone: text('contact_phone'),
  contactEmail: text('contact_email'),
  techContactName: text('tech_contact_name'),
  techContactPhone: text('tech_contact_phone'),
  techContactEmail: text('tech_contact_email'),
  pib: text('pib'),
  mib: text('mib'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const bankAccounts = sqliteTable('bank_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bankName: text('bank_name').notNull(),
  accountNumber: text('account_number').notNull(),
  swift: text('swift'),
  iban: text('iban'),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type MailPackage = typeof mailPackages.$inferSelect;
export type NewMailPackage = typeof mailPackages.$inferInsert;
export type WebHosting = typeof webHosting.$inferSelect;
export type NewWebHosting = typeof webHosting.$inferInsert;
export type MailHosting = typeof mailHosting.$inferSelect;
export type NewMailHosting = typeof mailHosting.$inferInsert;
export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type NotificationLogEntry = typeof notificationLog.$inferSelect;
export type ReportSetting = typeof reportSettings.$inferSelect;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type MailServer = typeof mailServers.$inferSelect;
export type NewMailServer = typeof mailServers.$inferInsert;
export type MailSecurity = typeof mailSecurity.$inferSelect;
export type NewMailSecurity = typeof mailSecurity.$inferInsert;
export type CompanyInfo = typeof companyInfo.$inferSelect;
export type NewCompanyInfo = typeof companyInfo.$inferInsert;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type NewBankAccount = typeof bankAccounts.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  userName: text('user_name').notNull(),
  userEmail: text('user_email').notNull(),
  action: text('action').notNull(), // create, update, delete, login, logout, etc.
  entityType: text('entity_type').notNull(), // client, domain, hosting, user, template, etc.
  entityId: integer('entity_id'),
  entityName: text('entity_name'),
  details: text('details', { mode: 'json' }).$type<Record<string, unknown>>(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

// 2FA and Security tables
export const verificationCodes = sqliteTable('verification_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  type: text('type').notNull().default('login'),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const backupCodes = sqliteTable('backup_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const loginAttempts = sqliteTable('login_attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ipAddress: text('ip_address').notNull(),
  email: text('email'),
  success: integer('success', { mode: 'boolean' }).notNull().default(false),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const blockedIps = sqliteTable('blocked_ips', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ipAddress: text('ip_address').notNull().unique(),
  reason: text('reason'),
  blockedUntil: text('blocked_until'),
  permanent: integer('permanent', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const emailLogs = sqliteTable('email_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fromEmail: text('from_email').notNull(),
  fromName: text('from_name'),
  toEmail: text('to_email').notNull(),
  ccEmail: text('cc_email'),
  subject: text('subject').notNull(),
  htmlContent: text('html_content').notNull(),
  textContent: text('text_content'),
  status: text('status', { enum: ['sent', 'failed'] }).notNull().default('sent'),
  error: text('error'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type EmailLog = typeof emailLogs.$inferSelect;
export type NewEmailLog = typeof emailLogs.$inferInsert;

export type VerificationCode = typeof verificationCodes.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type BlockedIp = typeof blockedIps.$inferSelect;
