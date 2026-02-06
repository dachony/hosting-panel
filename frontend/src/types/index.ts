export interface User {
  id: number;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role: 'superadmin' | 'admin' | 'salesadmin' | 'sales';
  isActive?: boolean;
  mustChangePassword?: boolean;
  twoFactorEnabled?: boolean;
  createdAt?: string;
}

export type ExpiryStatus = 'green' | 'yellow' | 'orange' | 'red' | 'forDeletion' | 'deleted';
export type DomainStatus = 'green' | 'yellow' | 'orange' | 'red' | 'forDeletion' | 'deleted';

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

export interface SystemConfig {
  sections: {
    blockedIps: boolean;
    lockedUsers: boolean;
    failedLogins: boolean;
    passwordChanges: boolean;
    resourceUsage: boolean;
    databaseSize: boolean;
  };
  period: 'today' | 'last7days' | 'last30days' | 'all';
}

export interface Client {
  id: number;
  name: string;
  domain?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email1?: string | null;
  email2?: string | null;
  email3?: string | null;
  techContact?: string | null;
  techPhone?: string | null;
  techEmail?: string | null;
  address?: string | null;
  pib?: string | null;
  mib?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  earliestExpiryDate?: string | null;
  daysUntilExpiry?: number | null;
  expiryStatus?: ExpiryStatus | null;
}

export interface Domain {
  id: number;
  clientId?: number | null;
  domainName: string;
  primaryContactName?: string | null;
  primaryContactPhone?: string | null;
  primaryContactEmail?: string | null;
  contactEmail1?: string | null;
  contactEmail2?: string | null;
  contactEmail3?: string | null;
  notes?: string | null;
  pdfFilename?: string | null;
  isActive: boolean;
  createdAt: string;
  clientName?: string | null;
}

export type ExtendPeriod = '1month' | '1year' | '2years' | '3years' | '5years' | 'unlimited';

export interface Package {
  id: number;
  name: string;
  description?: string | null;
  maxMailboxes: number;
  storageGb: number;
  price: number;
  features?: string[] | null;
  mailServerId?: number | null;
  mailServerName?: string | null;
  mailSecurityId?: number | null;
  mailSecurityName?: string | null;
  createdAt: string;
}

export interface Hosting {
  id: number | null;
  clientId?: number | null;
  domainId?: number | null;
  packageId?: number | null;
  startDate?: string | null;
  expiryDate: string | null;
  isActive?: boolean | null;
  isEnabled?: boolean;
  notes?: string | null;
  createdAt: string;
  clientName?: string | null;
  domainName?: string | null;
  packageName?: string | null;
  daysUntilExpiry?: number | null;
  expiryStatus?: ExpiryStatus;
}

export interface MailServer {
  id: number;
  name: string;
  hostname: string;
  description?: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface MailSecurity {
  id: number;
  name: string;
  hostname: string;
  description?: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface NotificationSetting {
  id: number;
  name: string;
  type: 'client' | 'service_request' | 'sales_request' | 'reports' | 'system';
  schedule: number[];
  runAtTime: string;
  templateId?: number | null;
  templateName?: string | null;
  recipientType: 'custom' | 'primary';
  customEmail?: string | null;
  includeTechnical: boolean;
  enabled: boolean;
  frequency?: 'hourly' | 'daily' | 'weekly' | 'monthly' | null;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  lastSent?: string | null;
}

export interface ReportSetting {
  id: number;
  name: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  enabled: boolean;
  lastSent?: string | null;
}

export interface EmailTemplate {
  id: number;
  name: string;
  type: string;
  subject: string;
  htmlContent: string;
  pdfTemplate?: string | null;
  variables?: string[] | null;
  reportConfig?: ReportConfig | null;
  systemConfig?: SystemConfig | null;
  attachDomainPdf?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  domainId: number | null;
  type: 'domain' | 'hosting' | 'mail';
  name: string;
  clientName: string | null;
  expiryDate: string;
  daysUntilExpiry: number;
}

export interface AuthResponse {
  token: string;
  user: User;
  mustChangePassword?: boolean;
}

export interface CompanyInfo {
  id: number;
  name: string;
  logo?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  phone2?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  techContactName?: string | null;
  techContactPhone?: string | null;
  techContactEmail?: string | null;
  pib?: string | null;
  mib?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccount {
  id: number;
  bankName: string;
  accountNumber: string;
  swift?: string | null;
  iban?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
