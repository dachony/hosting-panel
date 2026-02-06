import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { NotificationSetting, User, MailServer, MailSecurity, CompanyInfo, BankAccount, EmailTemplate, Package, ReportConfig, DomainStatus, SystemConfig } from '../types';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ColorPicker from '../components/common/ColorPicker';
import {
  Download,
  Upload,
  Send,
  Server,
  Bell,
  Database,
  Users,
  Plus,
  Trash2,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
  Star,
  HardDrive,
  User as UserIcon,
  Search,
  Building2,
  CreditCard,
  Image,
  Shield,
  Mail,
  FileText,
  Pencil,
  Copy,
  Package as PackageIcon,
  Save,
  Lock,
  KeyRound,
  Play,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

type TabType = 'system' | 'security' | 'my-account' | 'owner' | 'smtp' | 'mail-servers' | 'mail-security' | 'packages' | 'notifications' | 'templates' | 'import-export' | 'users';

interface SystemSettings {
  systemName: string;
  baseUrl: string;
}

interface SystemNotifications {
  enabled: boolean;
  recipientEmail: string;
  events: {
    superadminPasswordChange: boolean;
    adminPasswordChange: boolean;
    userLocked: boolean;
    diskUsageThreshold: boolean;
    diskUsagePercent: number;
    cpuUsageThreshold: boolean;
    cpuUsagePercent: number;
    memoryUsageThreshold: boolean;
    memoryUsagePercent: number;
    databaseError: boolean;
    applicationError: boolean;
    applicationStart: boolean;
    applicationStop: boolean;
    failedLoginAttempts: boolean;
    failedLoginThreshold: number;
    backupCompleted: boolean;
    backupFailed: boolean;
    sslCertExpiring: boolean;
    sslCertExpiringDays: number;
  };
}

interface SecuritySettings {
  maxLoginAttempts: number;
  lockoutMinutes: number;
  permanentBlockAttempts: number;
  twoFactorEnforcement: 'disabled' | 'optional' | 'required_admins' | 'required_all';
  twoFactorMethods: ('email' | 'totp')[];
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSpecial: boolean;
}

interface MailSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  imapPort: number;
  imapSecure: boolean;
}

export default function SettingsPage() {
  const { isAdmin, isSalesAdmin, canManageSystem, canManageContent, canEditPackages } = useAuth();
  const queryClient = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>('system');
  const [testEmail, setTestEmail] = useState('');

  // System settings state
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    systemName: 'Hosting Panel',
    baseUrl: '',
  });

  // System notifications state
  const [systemNotifications, setSystemNotifications] = useState<SystemNotifications>({
    enabled: false,
    recipientEmail: '',
    events: {
      superadminPasswordChange: true,
      adminPasswordChange: true,
      userLocked: true,
      diskUsageThreshold: false,
      diskUsagePercent: 90,
      cpuUsageThreshold: false,
      cpuUsagePercent: 90,
      memoryUsageThreshold: false,
      memoryUsagePercent: 90,
      databaseError: true,
      applicationError: true,
      applicationStart: true,
      applicationStop: true,
      failedLoginAttempts: true,
      failedLoginThreshold: 5,
      backupCompleted: false,
      backupFailed: true,
      sslCertExpiring: true,
      sslCertExpiringDays: 14,
    },
  });

  // Security settings state
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    maxLoginAttempts: 3,
    lockoutMinutes: 10,
    permanentBlockAttempts: 10,
    twoFactorEnforcement: 'optional',
    twoFactorMethods: ['email', 'totp'],
    passwordMinLength: 8,
    passwordRequireUppercase: true,
    passwordRequireLowercase: true,
    passwordRequireNumbers: true,
    passwordRequireSpecial: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [notificationSearchTerm, setNotificationSearchTerm] = useState('');
  const [notificationTypeFilter, setNotificationTypeFilter] = useState<string>('all');
  const [templateTypeFilter, setTemplateTypeFilter] = useState<string>('all');

  // Import/Export state
  const [exportTypes, setExportTypes] = useState<string[]>(['all']);
  const [importType, setImportType] = useState<string>('all');
  const [importValidation, setImportValidation] = useState<{
    valid: boolean;
    totalRows: number;
    validRows: number;
    errors: { row: number; field: string; message: string }[];
    preview: unknown[];
  } | null>(null);
  const [importData, setImportData] = useState<string | null>(null);
  const [importFormat, setImportFormat] = useState<'json' | 'csv'>('json');
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Import preview modal state
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<Record<string, unknown[]> | null>(null);
  const [importPreviewMeta, setImportPreviewMeta] = useState<{ version?: string; exportedAt?: string; fileName?: string } | null>(null);
  const [importSelections, setImportSelections] = useState<Record<string, boolean[]>>({});
  const [importExpandedSections, setImportExpandedSections] = useState<Set<string>>(new Set());

  // Export preview modal state
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [exportPreviewData, setExportPreviewData] = useState<Record<string, unknown[]> | null>(null);
  const [exportSelections, setExportSelections] = useState<Record<string, boolean[]>>({});
  const [exportExpandedSections, setExportExpandedSections] = useState<Set<string>>(new Set());
  const [exportLoading, setExportLoading] = useState(false);

  // User modal state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Mail server modal state
  const [mailServerModalOpen, setMailServerModalOpen] = useState(false);
  const [deleteMailServerDialogOpen, setDeleteMailServerDialogOpen] = useState(false);
  const [selectedMailServer, setSelectedMailServer] = useState<MailServer | null>(null);

  // Mail security modal state
  const [mailSecurityModalOpen, setMailSecurityModalOpen] = useState(false);
  const [deleteMailSecurityDialogOpen, setDeleteMailSecurityDialogOpen] = useState(false);
  const [selectedMailSecurity, setSelectedMailSecurity] = useState<MailSecurity | null>(null);

  // Bank account modal state
  const [bankAccountModalOpen, setBankAccountModalOpen] = useState(false);
  const [deleteBankAccountDialogOpen, setDeleteBankAccountDialogOpen] = useState(false);
  const [selectedBankAccount, setSelectedBankAccount] = useState<BankAccount | null>(null);

  // Notification modal state
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const [deleteNotificationDialogOpen, setDeleteNotificationDialogOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotificationSetting | null>(null);
  const [notificationForm, setNotificationForm] = useState({
    name: '',
    type: 'client' as 'client' | 'service_request' | 'sales_request' | 'reports' | 'system',
    schedule: [30, 14, 7, 1, 0] as number[],
    runAtTime: '09:00',
    templateId: null as number | null,
    recipientType: 'primary' as 'custom' | 'primary',
    customEmail: '',
    includeTechnical: false,
    enabled: true,
    frequency: 'daily' as 'daily' | 'weekly' | 'monthly',
    dayOfWeek: 1 as number | null,
    dayOfMonth: 1 as number | null,
  });

  // Template modal state
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templatePreviewModalOpen, setTemplatePreviewModalOpen] = useState(false);
  const [deleteTemplateDialogOpen, setDeleteTemplateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const defaultReportConfig: ReportConfig = {
    filters: {
      statuses: ['green', 'yellow', 'orange', 'red'],
    },
    sorting: {
      field: 'expiryDate',
      direction: 'asc',
    },
    groupByStatus: false,
  };

  const defaultSystemConfig: SystemConfig = {
    sections: {
      blockedIps: true,
      lockedUsers: true,
      failedLogins: true,
      passwordChanges: false,
      resourceUsage: false,
      databaseSize: true,
    },
    period: 'last7days',
  };

  const [templateForm, setTemplateForm] = useState({
    name: '',
    type: 'custom' as string,
    subject: '',
    title: '',
    body: '',
    signature: 'Best regards,\nYour team',
    isActive: true,
    showHeader: true,
    headerLogo: '' as string,
    headerImage: '' as string,
    headerBgColor: '#1e40af',
    headerBgTransparent: false,
    headerLogoPosition: 'left' as 'left' | 'center' | 'right',
    useCompanyLogo: true,
    showSignature: true,
    signatureLogo: '' as string,
    signatureImage: '' as string,
    useCompanyLogoInSignature: false,
    showFooter: false,
    footerImage: '' as string,
    footerBgColor: '#1e40af',
    footerBgTransparent: false,
    reportConfig: defaultReportConfig,
    systemConfig: defaultSystemConfig,
  });
  const templateBodyRef = useRef<HTMLTextAreaElement>(null);
  const templateSubjectRef = useRef<HTMLInputElement>(null);
  const logoUploadRef = useRef<HTMLInputElement>(null);
  const headerImageUploadRef = useRef<HTMLInputElement>(null);
  const signatureLogoUploadRef = useRef<HTMLInputElement>(null);
  const signatureImageUploadRef = useRef<HTMLInputElement>(null);
  const footerImageUploadRef = useRef<HTMLInputElement>(null);

  // Package modal state
  const [packageModalOpen, setPackageModalOpen] = useState(false);
  const [deletePackageDialogOpen, setDeletePackageDialogOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedMailServerId, setSelectedMailServerId] = useState<number | null>(null);
  const [selectedMailSecurityId, setSelectedMailSecurityId] = useState<number | null>(null);

  // Available variables for templates
  const templateVariables = [
    { key: 'clientName', label: 'Client Name', description: 'Client name' },
    { key: 'domainName', label: 'Domain', description: 'Domain name' },
    { key: 'expiryDate', label: 'Expiry Date', description: 'Expiry date' },
    { key: 'daysUntilExpiry', label: 'Days Left', description: 'Days until expiry' },
    { key: 'packageName', label: 'Package', description: 'Package name' },
    { key: 'companyName', label: 'Company', description: 'Company name' },
    { key: 'hostingStatus', label: 'Hosting Status', description: 'Hosting status (Enabled/Disabled)' },
    { key: 'packageDescription', label: 'Pkg Description', description: 'Package description' },
    { key: 'maxMailboxes', label: 'Mailboxes', description: 'Number of mailboxes' },
    { key: 'storageGb', label: 'Storage GB', description: 'Storage capacity in GB' },
    { key: 'primaryContactName', label: 'Primary Contact', description: 'Primary contact name' },
    { key: 'primaryContactPhone', label: 'Primary Phone', description: 'Primary contact phone' },
    { key: 'primaryContactEmail', label: 'Primary Email', description: 'Primary contact email' },
    { key: 'techContactName', label: 'Tech Contact', description: 'Technical contact name' },
    { key: 'techContactPhone', label: 'Tech Phone', description: 'Technical contact phone' },
    { key: 'techContactEmail', label: 'Tech Email', description: 'Technical contact email' },
  ];

  // Report-specific variable
  const reportVariable = { key: 'hostingList', label: 'Hosting List', description: 'Table with hosting list by filters' };

  // System-specific variable
  const systemVariable = { key: 'systemInfo', label: 'System Info', description: 'System information by configuration' };

  // Insert variable at cursor position
  const insertVariable = (variable: string, field: 'body' | 'subject') => {
    const target = field === 'body' ? templateBodyRef.current : templateSubjectRef.current;
    if (!target) return;

    const start = target.selectionStart || 0;
    const end = target.selectionEnd || 0;
    const currentValue = field === 'body' ? templateForm.body : templateForm.subject;
    const varText = `{{${variable}}}`;
    const newValue = currentValue.substring(0, start) + varText + currentValue.substring(end);

    if (field === 'body') {
      setTemplateForm(prev => ({ ...prev, body: newValue }));
    } else {
      setTemplateForm(prev => ({ ...prev, subject: newValue }));
    }

    // Set focus and cursor position after update
    setTimeout(() => {
      target.focus();
      const newPos = start + varText.length;
      target.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // Generate HTML from form fields
  const generateHtmlFromForm = () => {
    const bodyHtml = templateForm.body
      .split('\n')
      .map(line => `<p style="margin: 0 0 10px 0;">${line || '&nbsp;'}</p>`)
      .join('\n');

    const signatureTextHtml = templateForm.signature
      .split('\n')
      .map(line => `<p style="margin: 0;">${line || '&nbsp;'}</p>`)
      .join('\n');

    // Determine header logo source
    const headerLogoSrc = templateForm.useCompanyLogo ? '{{companyLogo}}' : templateForm.headerLogo;

    // Determine signature logo source
    const signatureLogoSrc = templateForm.useCompanyLogoInSignature ? '{{companyLogo}}' : templateForm.signatureLogo;

    // Build header HTML with logo position
    let headerHtml = '';
    if (templateForm.showHeader) {
      const bgStyle = templateForm.headerBgTransparent ? 'transparent' : templateForm.headerBgColor;
      const logoAlign = templateForm.headerLogoPosition || 'left';
      headerHtml = `
  <div data-section="header" style="background-color: ${bgStyle}; padding: 20px; border-radius: 8px 8px 0 0;">
    <div style="text-align: ${logoAlign};">
      ${headerLogoSrc ? `<img src="${headerLogoSrc}" alt="Logo" style="max-height: 60px; max-width: 200px;" />` : ''}
    </div>
    ${templateForm.headerImage ? `<div style="text-align: center; margin-top: 10px;"><img src="${templateForm.headerImage}" alt="Header" style="max-width: 100%;" /></div>` : ''}
  </div>`;
    }

    // Build title HTML
    const titleHtml = templateForm.title
      ? `<h2 style="margin: 0 0 20px 0; color: #333; font-size: 18px;">${templateForm.title}</h2>`
      : '';

    // Build signature HTML with optional logo/image
    let signatureHtml = '';
    if (templateForm.showSignature) {
      signatureHtml = `
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
      ${signatureTextHtml}
      ${signatureLogoSrc ? `<img src="${signatureLogoSrc}" alt="Logo" style="max-height: 40px; max-width: 150px; margin-top: 15px;" />` : ''}
      ${templateForm.signatureImage ? `<img src="${templateForm.signatureImage}" alt="" style="max-width: 200px; margin-top: 10px; display: block;" />` : ''}
    </div>`;
    }

    // Build footer HTML
    let footerHtml = '';
    if (templateForm.showFooter) {
      const footerBgStyle = templateForm.footerBgTransparent ? 'transparent' : templateForm.footerBgColor;
      footerHtml = `
  <div data-section="footer" style="background-color: ${footerBgStyle}; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
    ${templateForm.footerImage ? `<img src="${templateForm.footerImage}" alt="Footer" style="max-width: 100%; max-height: 100px;" />` : ''}
  </div>`;
    }

    return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
  ${headerHtml}
  <div style="padding: 30px;">
    ${titleHtml}
    ${bodyHtml}
    ${signatureHtml}
  </div>
  ${footerHtml}
</div>`;
  };

  // Parse HTML content to form fields (for editing existing templates)
  const parseHtmlToForm = (html: string) => {
    // Simple parser - extract text content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Try to extract header info
    let showHeader = false;
    let headerLogo = '';
    let headerImage = '';
    let headerBgColor = '#1e40af';
    let headerBgTransparent = false;
    let headerLogoPosition: 'left' | 'center' | 'right' = 'left';
    let useCompanyLogo = false;

    const headerDiv = tempDiv.querySelector('div[data-section="header"]') || tempDiv.querySelector('div[style*="background-color"]');
    if (headerDiv) {
      showHeader = true;
      const bgMatch = headerDiv.getAttribute('style')?.match(/background-color:\s*([^;]+)/);
      if (bgMatch) {
        const bgValue = bgMatch[1].trim();
        if (bgValue === 'transparent') {
          headerBgTransparent = true;
        } else {
          headerBgColor = bgValue;
        }
      }

      // Check logo position
      const logoContainer = headerDiv.querySelector('div[style*="text-align"]');
      if (logoContainer) {
        const alignMatch = logoContainer.getAttribute('style')?.match(/text-align:\s*([^;]+)/);
        if (alignMatch) {
          headerLogoPosition = alignMatch[1].trim() as 'left' | 'center' | 'right';
        }
      }

      const imgs = headerDiv.querySelectorAll('img');
      imgs.forEach((img, i) => {
        const src = img.getAttribute('src') || '';
        if (i === 0) {
          if (src === '{{companyLogo}}') {
            useCompanyLogo = true;
          } else {
            headerLogo = src;
          }
        } else {
          headerImage = src;
        }
      });
    }

    // Try to extract footer info
    let showFooter = false;
    let footerImage = '';
    let footerBgColor = '#1e40af';
    let footerBgTransparent = false;

    const footerDiv = tempDiv.querySelector('div[data-section="footer"]');
    if (footerDiv) {
      showFooter = true;
      const bgMatch = footerDiv.getAttribute('style')?.match(/background-color:\s*([^;]+)/);
      if (bgMatch) {
        const bgValue = bgMatch[1].trim();
        if (bgValue === 'transparent') {
          footerBgTransparent = true;
        } else {
          footerBgColor = bgValue;
        }
      }

      const footerImg = footerDiv.querySelector('img');
      if (footerImg) {
        footerImage = footerImg.getAttribute('src') || '';
      }
    }

    // Try to extract title (h2 tag in content area)
    const contentDiv = tempDiv.querySelector('div[style*="padding: 30px"]') || tempDiv;
    const titleEl = contentDiv.querySelector('h2');
    let title = titleEl?.textContent || '';

    // Get all paragraphs (excluding those in signature)
    const signatureDiv = contentDiv.querySelector('div[style*="border-top"]');
    let body = '';
    let signature = 'Best regards,\nYour team';
    let showSignature = false;
    let signatureLogo = '';
    let signatureImage = '';
    let useCompanyLogoInSignature = false;

    // Extract signature info
    if (signatureDiv) {
      showSignature = true;
      const sigParagraphs = signatureDiv.querySelectorAll('p');
      signature = Array.from(sigParagraphs).map(p => p.textContent || '').join('\n');

      // Check for signature logo/image
      const sigImgs = signatureDiv.querySelectorAll('img');
      sigImgs.forEach((img, i) => {
        const src = img.getAttribute('src') || '';
        if (i === 0) {
          if (src === '{{companyLogo}}') {
            useCompanyLogoInSignature = true;
          } else {
            signatureLogo = src;
          }
        } else {
          signatureImage = src;
        }
      });
    }

    // Body is all p tags in content div (not in signature, not h2)
    const allParagraphs = contentDiv.querySelectorAll('p');
    const bodyParagraphs: string[] = [];
    allParagraphs.forEach((p) => {
      if (signatureDiv && signatureDiv.contains(p)) return; // Skip signature
      bodyParagraphs.push(p.textContent || '');
    });
    if (bodyParagraphs.length > 0) {
      body = bodyParagraphs.join('\n');
    }

    // If parsing fails, just use the plain text
    if (!body && html) {
      body = tempDiv.textContent || '';
    }

    return {
      title, body, signature,
      showHeader, headerLogo, headerImage, headerBgColor, headerBgTransparent, headerLogoPosition, useCompanyLogo,
      showSignature, signatureLogo, signatureImage, useCompanyLogoInSignature,
      showFooter, footerImage, footerBgColor, footerBgTransparent
    };
  };

  // Initialize form when opening modal
  const openTemplateModal = (template: EmailTemplate | null) => {
    if (template) {
      const parsed = parseHtmlToForm(template.htmlContent);
      setTemplateForm({
        name: template.name,
        type: template.type,
        subject: template.subject,
        title: parsed.title,
        body: parsed.body,
        signature: parsed.signature,
        isActive: template.isActive,
        showHeader: parsed.showHeader,
        headerLogo: parsed.headerLogo,
        headerImage: parsed.headerImage,
        headerBgColor: parsed.headerBgColor,
        headerBgTransparent: parsed.headerBgTransparent,
        headerLogoPosition: parsed.headerLogoPosition || 'left',
        useCompanyLogo: parsed.useCompanyLogo,
        showSignature: parsed.showSignature,
        signatureLogo: parsed.signatureLogo,
        signatureImage: parsed.signatureImage,
        useCompanyLogoInSignature: parsed.useCompanyLogoInSignature,
        showFooter: parsed.showFooter || false,
        footerImage: parsed.footerImage || '',
        footerBgColor: parsed.footerBgColor || '#1e40af',
        footerBgTransparent: parsed.footerBgTransparent || false,
        reportConfig: template.reportConfig || defaultReportConfig,
        systemConfig: template.systemConfig || defaultSystemConfig,
      });
    } else {
      setTemplateForm({
        name: '',
        type: 'custom',
        subject: '',
        title: '',
        body: '',
        signature: 'Best regards,\nYour team',
        isActive: true,
        showHeader: true,
        headerLogo: '',
        headerImage: '',
        headerBgColor: '#1e40af',
        headerBgTransparent: false,
        headerLogoPosition: 'left',
        useCompanyLogo: true,
        showSignature: true,
        signatureLogo: '',
        signatureImage: '',
        useCompanyLogoInSignature: false,
        showFooter: false,
        footerImage: '',
        footerBgColor: '#1e40af',
        footerBgTransparent: false,
        reportConfig: defaultReportConfig,
        systemConfig: defaultSystemConfig,
      });
    }
    setSelectedTemplate(template);
    setTemplateModalOpen(true);
  };

  // Handle logo upload
  const handleTemplateLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1 * 1024 * 1024) {
        toast.error('Logo must be less than 1MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setTemplateForm(prev => ({ ...prev, headerLogo: reader.result as string, useCompanyLogo: false }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle header image upload
  const handleHeaderImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Image must be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setTemplateForm(prev => ({ ...prev, headerImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle signature logo upload
  const handleSignatureLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1 * 1024 * 1024) {
        toast.error('Logo must be less than 1MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setTemplateForm(prev => ({ ...prev, signatureLogo: reader.result as string, useCompanyLogoInSignature: false }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle signature image upload
  const handleSignatureImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Image must be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setTemplateForm(prev => ({ ...prev, signatureImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle footer image upload
  const handleFooterImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Image must be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setTemplateForm(prev => ({ ...prev, footerImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle visual template form submit
  const handleVisualTemplateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const htmlContent = generateHtmlFromForm();
    const allVariables = [...templateVariables];
    if (templateForm.type === 'reports') {
      allVariables.push(reportVariable);
    }
    if (templateForm.type === 'system') {
      allVariables.push(systemVariable);
    }
    const variables = allVariables
      .filter(v => templateForm.body.includes(`{{${v.key}}}`) || templateForm.subject.includes(`{{${v.key}}}`))
      .map(v => v.key);

    const templateData: Parameters<typeof saveTemplateMutation.mutate>[0] = {
      name: templateForm.name,
      type: templateForm.type as EmailTemplate['type'],
      subject: templateForm.subject,
      htmlContent,
      variables: variables.length > 0 ? variables : null,
      isActive: templateForm.isActive,
    };

    // Include reportConfig only for report templates
    if (templateForm.type === 'reports') {
      templateData.reportConfig = templateForm.reportConfig;
    } else {
      templateData.reportConfig = null;
    }

    // Include systemConfig only for system templates
    if (templateForm.type === 'system') {
      templateData.systemConfig = templateForm.systemConfig;
    } else {
      templateData.systemConfig = null;
    }

    saveTemplateMutation.mutate(templateData);
  };

  // Mail settings state (SMTP + IMAP)
  const [mailSettings, setMailSettings] = useState<MailSettings>({
    host: 'localhost',
    port: 1025,
    secure: false,
    user: '',
    password: '',
    fromEmail: 'noreply@hosting-dashboard.local',
    fromName: 'Hosting Panel',
    imapPort: 993,
    imapSecure: true,
  });

  // Company info state
  const [companyInfo, setCompanyInfo] = useState<Partial<CompanyInfo>>({
    name: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
    website: '',
    email: '',
    phone: '',
    phone2: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    techContactName: '',
    techContactPhone: '',
    techContactEmail: '',
    pib: '',
    mib: '',
  });
  const [_showPhone2, _setShowPhone2] = useState(false);

  // Queries
  const { data: notificationSettings } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => api.get<{ settings: NotificationSetting[] }>('/api/notifications/settings'),
  });

  const { data: systemSettingsData, isLoading: systemSettingsLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api.get<{ settings: SystemSettings }>('/api/settings/system'),
    staleTime: 1000 * 60 * 5,
  });

  // Sync system settings state with query data
  useEffect(() => {
    if (systemSettingsData?.settings) {
      setSystemSettings(systemSettingsData.settings);
    }
  }, [systemSettingsData]);

  // System notifications query
  const { data: systemNotificationsData } = useQuery({
    queryKey: ['system-notifications'],
    queryFn: () => api.get<{ settings: SystemNotifications }>('/api/settings/system-notifications'),
    staleTime: 1000 * 60 * 5,
    enabled: isAdmin,
  });

  // Sync system notifications state with query data
  useEffect(() => {
    if (systemNotificationsData?.settings) {
      setSystemNotifications(systemNotificationsData.settings);
    }
  }, [systemNotificationsData]);

  // Security settings query (admin only)
  const { data: securitySettingsData, isLoading: securitySettingsLoading } = useQuery({
    queryKey: ['security-settings'],
    queryFn: () => api.get<{ settings: SecuritySettings }>('/api/security/settings'),
    staleTime: 1000 * 60 * 5,
    enabled: isAdmin,
  });

  // Sync security settings state with query data
  useEffect(() => {
    if (securitySettingsData?.settings) {
      setSecuritySettings(securitySettingsData.settings);
    }
  }, [securitySettingsData]);

  // Blocked IPs query (admin only)
  const { data: blockedIpsData, isLoading: blockedIpsLoading } = useQuery({
    queryKey: ['blocked-ips'],
    queryFn: () => api.get<{ blocked: Array<{ id: number; ipAddress: string; reason: string; blockedUntil: string | null; permanent: boolean; createdAt: string }> }>('/api/security/blocked-ips'),
    enabled: isAdmin,
  });

  // Locked Users query (admin only)
  const { data: lockedUsersData, isLoading: lockedUsersLoading } = useQuery({
    queryKey: ['locked-users'],
    queryFn: () => api.get<{ lockedUsers: Array<{ id: number; email: string; name: string; lockedUntil: string | null; failedLoginAttempts: number }> }>('/api/security/locked-users'),
    enabled: isAdmin,
  });

  // My Account 2FA status query
  const { data: my2FAStatus, isLoading: my2FALoading, refetch: refetchMy2FA } = useQuery({
    queryKey: ['my-2fa-status'],
    queryFn: () => api.get<{ enabled: boolean; method: 'email' | 'totp' | null }>('/api/security/2fa/status'),
  });

  // My Account 2FA state
  const [setup2FAModalOpen, setSetup2FAModalOpen] = useState(false);
  const [disable2FAModalOpen, setDisable2FAModalOpen] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [setup2FAMethod, setSetup2FAMethod] = useState<'email' | 'totp'>('email');
  const [setup2FAStep, setSetup2FAStep] = useState<'choose' | 'verify'>('choose');
  const [backupCodesToShow, setBackupCodesToShow] = useState<string[]>([]);

  const { isLoading: mailSettingsLoading } = useQuery({
    queryKey: ['mail-settings'],
    queryFn: async () => {
      const result = await api.get<{ settings: MailSettings }>('/api/notifications/mail-settings');
      setMailSettings(result.settings);
      return result;
    },
  });

  // Load saved test email
  useQuery({
    queryKey: ['test-email-setting'],
    queryFn: async () => {
      const result = await api.get<{ key: string; value: string }>('/api/settings/testEmail');
      if (result.value) {
        setTestEmail(result.value);
      }
      return result;
    },
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: User[] }>('/api/users'),
    enabled: isAdmin,
  });

  const { data: mailServersData, isLoading: mailServersLoading } = useQuery({
    queryKey: ['mail-servers'],
    queryFn: () => api.get<{ servers: MailServer[] }>('/api/mail-servers'),
  });

  const { data: mailSecurityData, isLoading: mailSecurityLoading } = useQuery({
    queryKey: ['mail-security'],
    queryFn: () => api.get<{ services: MailSecurity[] }>('/api/mail-security'),
  });

  const { isLoading: companyLoading } = useQuery({
    queryKey: ['company-info'],
    queryFn: async () => {
      const result = await api.get<{ company: CompanyInfo | null }>('/api/company/info');
      if (result.company) {
        setCompanyInfo(result.company);
      }
      return result;
    },
  });

  const { data: bankAccountsData, isLoading: bankAccountsLoading } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => api.get<{ accounts: BankAccount[] }>('/api/company/bank-accounts'),
  });

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<{ templates: EmailTemplate[] }>('/api/templates'),
  });

  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ['packages'],
    queryFn: () => api.get<{ packages: Package[] }>('/api/packages'),
  });

  // Mutations
  const updateNotificationMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<NotificationSetting>; closeModal?: boolean }) =>
      api.put(`/api/notifications/settings/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success('Settings saved');
      if (variables.closeModal) {
        setNotificationModalOpen(false);
        resetNotificationForm();
      }
    },
    onError: () => toast.error('Error saving'),
  });

  const createNotificationMutation = useMutation({
    mutationFn: (data: typeof notificationForm) => api.post('/api/notifications/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success('Notification created');
      setNotificationModalOpen(false);
      resetNotificationForm();
    },
    onError: () => toast.error('Error creating'),
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/notifications/settings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success('Notification deleted');
      setDeleteNotificationDialogOpen(false);
      setSelectedNotification(null);
    },
    onError: () => toast.error('Error deleting'),
  });

  const copyNotificationMutation = useMutation({
    mutationFn: (notification: NotificationSetting) => api.post('/api/notifications/settings', {
      name: `${notification.name} - Copy`,
      type: notification.type,
      schedule: notification.schedule,
      runAtTime: notification.runAtTime,
      templateId: notification.templateId,
      recipientType: notification.recipientType,
      customEmail: notification.customEmail,
      includeTechnical: notification.includeTechnical,
      enabled: false, // Start as disabled
      frequency: notification.frequency,
      dayOfWeek: notification.dayOfWeek,
      dayOfMonth: notification.dayOfMonth,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success('Notification copied');
    },
    onError: () => toast.error('Error copying notification'),
  });

  const saveSystemSettingsMutation = useMutation({
    mutationFn: (settings: SystemSettings) => api.put<{ settings: SystemSettings }>('/api/settings/system', settings),
    onSuccess: (data) => {
      queryClient.setQueryData(['system-settings'], data);
      toast.success('System settings saved');
    },
    onError: () => toast.error('Error saving'),
  });

  const saveSecuritySettingsMutation = useMutation({
    mutationFn: (settings: SecuritySettings) => api.put<{ settings: SecuritySettings }>('/api/security/settings', settings),
    onSuccess: (data) => {
      queryClient.setQueryData(['security-settings'], data);
      toast.success('Security settings saved');
    },
    onError: () => toast.error('Error saving security settings'),
  });

  const saveSystemNotificationsMutation = useMutation({
    mutationFn: (settings: SystemNotifications) => api.put<{ settings: SystemNotifications }>('/api/settings/system-notifications', settings),
    onSuccess: (data) => {
      queryClient.setQueryData(['system-notifications'], data);
      toast.success('System notifications saved');
    },
    onError: () => toast.error('Error saving system notifications'),
  });

  const unblockIpMutation = useMutation({
    mutationFn: (ip: string) => api.delete(`/api/security/blocked-ips/${encodeURIComponent(ip)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-ips'] });
      toast.success('IP unblocked');
    },
    onError: () => toast.error('Error unblocking IP'),
  });

  const unlockUserMutation = useMutation({
    mutationFn: (userId: number) => api.post(`/api/security/unlock-user/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locked-users'] });
      toast.success('User unlocked');
    },
    onError: () => toast.error('Error unlocking user'),
  });

  // 2FA Setup mutations
  const setupEmail2FAMutation = useMutation({
    mutationFn: () => api.post('/api/security/2fa/setup/email'),
    onSuccess: () => {
      setSetup2FAStep('verify');
      toast.success('Verification code sent to your email');
    },
    onError: () => toast.error('Failed to send verification code'),
  });

  const verifyEmail2FAMutation = useMutation({
    mutationFn: (code: string) => api.post<{ message: string; method: string }>('/api/security/2fa/verify/email', { code }),
    onSuccess: () => {
      refetchMy2FA();
      setSetup2FAModalOpen(false);
      resetSetup2FAState();
      toast.success('Email 2FA enabled successfully');
    },
    onError: () => toast.error('Invalid verification code'),
  });

  const setupTOTP2FAMutation = useMutation({
    mutationFn: () => api.post<{ secret: string; qrCode: string }>('/api/security/2fa/setup/totp'),
    onSuccess: (data) => {
      setTotpSetupData(data);
      setSetup2FAStep('verify');
    },
    onError: () => toast.error('Failed to setup TOTP'),
  });

  const verifyTOTP2FAMutation = useMutation({
    mutationFn: (code: string) => api.post<{ message: string; method: string; backupCodes: string[] }>('/api/security/2fa/verify/totp', { code }),
    onSuccess: (data) => {
      refetchMy2FA();
      if (data.backupCodes) {
        setBackupCodesToShow(data.backupCodes);
      } else {
        setSetup2FAModalOpen(false);
        resetSetup2FAState();
      }
      toast.success('Authenticator 2FA enabled successfully');
    },
    onError: () => toast.error('Invalid verification code'),
  });

  const disable2FAMutation = useMutation({
    mutationFn: (password: string) => api.post('/api/security/2fa/disable', { password }),
    onSuccess: () => {
      refetchMy2FA();
      setDisable2FAModalOpen(false);
      setDisablePassword('');
      toast.success('2FA disabled');
    },
    onError: () => toast.error('Invalid password'),
  });

  const regenerateBackupCodesMutation = useMutation({
    mutationFn: () => api.post<{ backupCodes: string[] }>('/api/security/2fa/backup-codes/regenerate'),
    onSuccess: (data) => {
      setBackupCodesToShow(data.backupCodes);
      toast.success('New backup codes generated');
    },
    onError: () => toast.error('Failed to regenerate backup codes'),
  });

  const resetSetup2FAState = () => {
    setSetup2FAStep('choose');
    setSetup2FAMethod('email');
    setTotpSetupData(null);
    setVerificationCode('');
    setBackupCodesToShow([]);
  };

  const saveMailSettingsMutation = useMutation({
    mutationFn: (settings: MailSettings) => api.put('/api/notifications/mail-settings', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-settings'] });
      toast.success('Mail settings saved');
    },
    onError: () => toast.error('Error saving'),
  });

  const verifySmtpMutation = useMutation({
    mutationFn: () => api.post('/api/notifications/smtp/verify', {}),
    onSuccess: () => toast.success('SMTP connection successful'),
    onError: () => toast.error('SMTP connection failed'),
  });

  const verifyImapMutation = useMutation({
    mutationFn: () => api.post('/api/notifications/imap/verify', {}),
    onSuccess: () => toast.success('IMAP connection successful'),
    onError: () => toast.error('IMAP connection failed'),
  });

  const testSmtpMutation = useMutation({
    mutationFn: (email: string) => api.post('/api/notifications/smtp/test', { email }),
    onSuccess: () => toast.success('Test email sent'),
    onError: () => toast.error('Error sending'),
  });

  const saveTestEmailMutation = useMutation({
    mutationFn: (email: string) => api.put('/api/settings/testEmail', { value: email }),
    onSuccess: () => toast.success('Test email saved'),
    onError: () => toast.error('Error saving'),
  });

  const testNotificationMutation = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) => api.post(`/api/notifications/settings/${id}/test`, { email }),
    onSuccess: () => toast.success('Test notification sent'),
    onError: () => toast.error('Error sending test notification'),
  });

  const triggerNotificationMutation = useMutation({
    mutationFn: (id: number) => api.post<{ message: string }>(`/api/notifications/settings/${id}/trigger`),
    onSuccess: (data) => {
      toast.success(data.message || 'Notification triggered');
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.error || 'Error triggering notification'),
  });

  const testTemplateMutation = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) => api.post(`/api/templates/${id}/test`, { email }),
    onSuccess: () => toast.success('Test template sent'),
    onError: () => toast.error('Error sending test template'),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deleted');
      setDeleteUserDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => toast.error(error.message || 'Error deleting'),
  });

  const saveUserMutation = useMutation({
    mutationFn: (data: {
      email: string;
      firstName: string;
      lastName: string;
      phone?: string;
      role: string;
      password?: string;
      sendInvite?: boolean;
      isActive?: boolean;
    }): Promise<{ inviteSent?: boolean }> => {
      if (selectedUser) {
        return api.put<{ inviteSent?: boolean }>(`/api/users/${selectedUser.id}`, data);
      }
      return api.post<{ inviteSent?: boolean }>('/api/users', data);
    },
    onSuccess: (data: { inviteSent?: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      if (data?.inviteSent) {
        toast.success('User created and invitation sent');
      } else {
        toast.success(selectedUser ? 'User updated' : 'User created');
      }
      setUserModalOpen(false);
      setSelectedUser(null);
    },
    onError: (error: Error & { response?: { data?: { error?: string; details?: string[] } } }) => {
      const msg = error.response?.data?.error || 'Error saving';
      const details = error.response?.data?.details;
      if (details && details.length > 0) {
        toast.error(`${msg}: ${details.join(', ')}`);
      } else {
        toast.error(msg);
      }
    },
  });

  const toggleUserActiveMutation = useMutation({
    mutationFn: (userId: number) => api.patch(`/api/users/${userId}/toggle-active`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User status changed');
    },
    onError: () => toast.error('Error changing status'),
  });

  const resendInviteMutation = useMutation({
    mutationFn: (userId: number) => api.post(`/api/users/${userId}/resend-invite`, {}),
    onSuccess: () => {
      toast.success('Invitation resent');
    },
    onError: () => toast.error('Error sending invitation'),
  });

  // Mail server mutations
  const saveMailServerMutation = useMutation({
    mutationFn: (data: { name: string; hostname: string; description?: string; isDefault?: boolean }) => {
      if (selectedMailServer) {
        return api.put(`/api/mail-servers/${selectedMailServer.id}`, data);
      }
      return api.post('/api/mail-servers', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-servers'] });
      toast.success(selectedMailServer ? 'Mail server updated' : 'Mail server created');
      setMailServerModalOpen(false);
      setSelectedMailServer(null);
    },
    onError: () => toast.error('Error saving'),
  });

  const deleteMailServerMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/mail-servers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-servers'] });
      toast.success('Mail server deleted');
      setDeleteMailServerDialogOpen(false);
      setSelectedMailServer(null);
    },
    onError: () => toast.error('Error deleting'),
  });

  const setDefaultMailServerMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/mail-servers/${id}/set-default`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-servers'] });
      toast.success('Default mail server set');
    },
    onError: () => toast.error('Error setting default'),
  });

  // Mail security mutations
  const saveMailSecurityMutation = useMutation({
    mutationFn: (data: { name: string; hostname: string; description?: string; isDefault?: boolean }) => {
      if (selectedMailSecurity) {
        return api.put(`/api/mail-security/${selectedMailSecurity.id}`, data);
      }
      return api.post('/api/mail-security', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-security'] });
      toast.success(selectedMailSecurity ? 'Mail security updated' : 'Mail security created');
      setMailSecurityModalOpen(false);
      setSelectedMailSecurity(null);
    },
    onError: () => toast.error('Error saving'),
  });

  const deleteMailSecurityMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/mail-security/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-security'] });
      toast.success('Mail security deleted');
      setDeleteMailSecurityDialogOpen(false);
      setSelectedMailSecurity(null);
    },
    onError: () => toast.error('Error deleting'),
  });

  const setDefaultMailSecurityMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/mail-security/${id}/set-default`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-security'] });
      toast.success('Default mail security set');
    },
    onError: () => toast.error('Error setting default'),
  });

  // Template mutations
  const saveTemplateMutation = useMutation({
    mutationFn: (data: Partial<EmailTemplate>) => {
      if (selectedTemplate) {
        return api.put(`/api/templates/${selectedTemplate.id}`, data);
      }
      return api.post('/api/templates', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success(selectedTemplate ? 'Template updated' : 'Template created');
      setTemplateModalOpen(false);
      setSelectedTemplate(null);
    },
    onError: () => toast.error('Error saving'),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template deleted');
      setDeleteTemplateDialogOpen(false);
      setSelectedTemplate(null);
    },
    onError: () => toast.error('Error deleting'),
  });

  const copyTemplateMutation = useMutation({
    mutationFn: (template: EmailTemplate) => api.post('/api/templates', {
      name: `${template.name} - Copy`,
      type: template.type,
      subject: template.subject,
      htmlContent: template.htmlContent,
      pdfTemplate: template.pdfTemplate,
      variables: template.variables,
      isActive: template.isActive,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template copied');
    },
    onError: () => toast.error('Error copying template'),
  });

  // Package mutations
  const savePackageMutation = useMutation({
    mutationFn: (data: Partial<Package>) => {
      if (selectedPackage) {
        return api.put(`/api/packages/${selectedPackage.id}`, data);
      }
      return api.post('/api/packages', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      toast.success(selectedPackage ? 'Package updated' : 'Package created');
      setPackageModalOpen(false);
      setSelectedPackage(null);
    },
    onError: () => toast.error('Error saving'),
  });

  const deletePackageMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/packages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      toast.success('Package deleted');
      setDeletePackageDialogOpen(false);
      setSelectedPackage(null);
    },
    onError: () => toast.error('Error deleting'),
  });

  // Company info mutations
  const saveCompanyInfoMutation = useMutation({
    mutationFn: (data: Partial<CompanyInfo>) => api.put('/api/company/info', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-info'] });
      toast.success('Company info saved');
    },
    onError: () => toast.error('Error saving'),
  });

  const uploadLogoMutation = useMutation({
    mutationFn: (logo: string) => api.post('/api/company/logo', { logo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-info'] });
      toast.success('Logo uploaded');
    },
    onError: () => toast.error('Error uploading logo'),
  });

  const deleteLogoMutation = useMutation({
    mutationFn: () => api.delete('/api/company/logo'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-info'] });
      setCompanyInfo(prev => ({ ...prev, logo: null }));
      toast.success('Logo deleted');
    },
    onError: () => toast.error('Error deleting logo'),
  });

  // Bank account mutations
  const saveBankAccountMutation = useMutation({
    mutationFn: (data: { bankName: string; accountNumber: string; swift?: string; iban?: string; isDefault?: boolean }) => {
      if (selectedBankAccount) {
        return api.put(`/api/company/bank-accounts/${selectedBankAccount.id}`, data);
      }
      return api.post('/api/company/bank-accounts', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success(selectedBankAccount ? 'Bank account updated' : 'Bank account added');
      setBankAccountModalOpen(false);
      setSelectedBankAccount(null);
    },
    onError: () => toast.error('Error saving'),
  });

  const deleteBankAccountMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/company/bank-accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success('Bank account deleted');
      setDeleteBankAccountDialogOpen(false);
      setSelectedBankAccount(null);
    },
    onError: () => toast.error('Error deleting'),
  });

  const setDefaultBankAccountMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/company/bank-accounts/${id}/set-default`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success('Default bank account set');
    },
    onError: () => toast.error('Error setting default'),
  });

  // Handlers
  // Helper maps for preview modals
  const typeLabelsMap: Record<string, string> = {
    clients: 'Clients',
    domains: 'Domains',
    webHosting: 'Web Hosting',
    mailHosting: 'Mail Hosting',
    packages: 'Packages',
    templates: 'Email Templates',
    notificationSettings: 'Notification Settings',
    reportSettings: 'Report Settings',
    appSettings: 'App Settings',
    companyInfo: 'Company Info',
    bankAccounts: 'Bank Accounts',
    mailServers: 'Mail Servers',
    mailSecurity: 'Mail Security',
  };

  const getItemDisplayName = (type: string, item: Record<string, unknown>): string => {
    switch (type) {
      case 'clients': return (item.name as string) || `Client #${item.id || '?'}`;
      case 'domains': return (item.domainName as string) || `Domain #${item.id || '?'}`;
      case 'webHosting': return (item.domainName as string) || `Hosting #${item.id || '?'}`;
      case 'mailHosting': return (item.domainName as string) || `Mail #${item.id || '?'}`;
      case 'packages': return (item.name as string) || `Package #${item.id || '?'}`;
      case 'templates': return (item.name as string) || `Template #${item.id || '?'}`;
      case 'notificationSettings': return (item.name as string) || `Notification #${item.id || '?'}`;
      case 'reportSettings': return (item.name as string) || `Report #${item.id || '?'}`;
      case 'appSettings': return (item.key as string) || `Setting #${item.id || '?'}`;
      case 'companyInfo': return (item.name as string) || 'Company Info';
      case 'bankAccounts': return (item.bankName as string) || `Account #${item.id || '?'}`;
      case 'mailServers': return (item.name as string) || `Server #${item.id || '?'}`;
      case 'mailSecurity': return (item.name as string) || `Security #${item.id || '?'}`;
      default: return `Item #${item.id || '?'}`;
    }
  };

  const getItemSubtitle = (type: string, item: Record<string, unknown>): string | null => {
    switch (type) {
      case 'clients': return [item.contactPerson, item.email1, item.phone].filter(Boolean).join(' · ') || null;
      case 'domains': return [item.clientName, item.registrar].filter(Boolean).join(' · ') || null;
      case 'webHosting':
      case 'mailHosting': return [item.clientName, item.packageName, item.expiryDate].filter(Boolean).join(' · ') || null;
      case 'packages': return [item.maxMailboxes && `${item.maxMailboxes} mailboxes`, item.storageGb && `${item.storageGb} GB`, item.price && `${item.price} RSD`].filter(Boolean).join(' · ') || null;
      case 'templates': return [item.type, item.subject].filter(Boolean).join(' · ') || null;
      case 'notificationSettings': return [item.type, item.enabled ? 'Enabled' : 'Disabled'].filter(Boolean).join(' · ') || null;
      case 'appSettings': {
        const val = item.value;
        if (val == null) return null;
        if (typeof val === 'string') {
          try { const parsed = JSON.parse(val); return typeof parsed === 'object' ? Object.keys(parsed).join(', ') : String(parsed); } catch { return val; }
        }
        return typeof val === 'object' ? Object.keys(val).join(', ') : String(val);
      }
      case 'companyInfo': return [item.address, item.phone, item.email].filter(Boolean).join(' · ') || null;
      case 'bankAccounts': return [item.accountNumber, item.swift].filter(Boolean).join(' · ') || null;
      case 'mailServers': return [item.hostname, item.port && `port ${item.port}`].filter(Boolean).join(' · ') || null;
      case 'mailSecurity': return (item.description as string) || null;
      default: return null;
    }
  };

  const initializeSelections = (data: Record<string, unknown[]>, allSelected = true): Record<string, boolean[]> => {
    const selections: Record<string, boolean[]> = {};
    for (const [key, items] of Object.entries(data)) {
      if (Array.isArray(items) && items.length > 0) {
        selections[key] = items.map(() => allSelected);
      }
    }
    return selections;
  };

  const getSelectedCount = (selections: Record<string, boolean[]>): number => {
    return Object.values(selections).reduce((sum, arr) => sum + arr.filter(Boolean).length, 0);
  };

  const toggleSectionExpand = (section: string, expandedSet: Set<string>, setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    const next = new Set(expandedSet);
    if (next.has(section)) {
      next.delete(section);
    } else {
      next.add(section);
    }
    setExpanded(next);
  };

  const toggleAllInSection = (section: string, selections: Record<string, boolean[]>, setSelections: React.Dispatch<React.SetStateAction<Record<string, boolean[]>>>) => {
    const current = selections[section] || [];
    const allSelected = current.every(Boolean);
    setSelections(prev => ({
      ...prev,
      [section]: current.map(() => !allSelected),
    }));
  };

  const toggleItem = (section: string, index: number, _selections: Record<string, boolean[]>, setSelections: React.Dispatch<React.SetStateAction<Record<string, boolean[]>>>) => {
    setSelections(prev => ({
      ...prev,
      [section]: prev[section].map((v, i) => i === index ? !v : v),
    }));
  };

  const isSectionPartiallySelected = (section: string, selections: Record<string, boolean[]>): boolean => {
    const current = selections[section] || [];
    const selectedCount = current.filter(Boolean).length;
    return selectedCount > 0 && selectedCount < current.length;
  };

  const isSectionFullySelected = (section: string, selections: Record<string, boolean[]>): boolean => {
    const current = selections[section] || [];
    return current.length > 0 && current.every(Boolean);
  };

  // Handle confirmed import of selected items
  const handleImportConfirmSelected = async () => {
    if (!importPreviewData) return;

    const filteredData: Record<string, unknown[]> = {};
    for (const [key, items] of Object.entries(importPreviewData)) {
      const selected = importSelections[key];
      if (selected) {
        const filteredItems = items.filter((_, i) => selected[i]);
        if (filteredItems.length > 0) {
          filteredData[key] = filteredItems;
        }
      }
    }

    if (Object.keys(filteredData).length === 0) {
      toast.error('No items selected');
      return;
    }

    try {
      const payload = {
        version: importPreviewMeta?.version || '2.0',
        exportedAt: importPreviewMeta?.exportedAt,
        data: filteredData,
      };

      const result = await api.post('/api/backup/import', payload) as { results: Record<string, { imported: number; skipped: number; errors: string[] }> };
      const totalImported = Object.values(result.results).reduce((sum, r) => sum + r.imported, 0);
      const totalSkipped = Object.values(result.results).reduce((sum, r) => sum + r.skipped, 0);

      toast.success(`Imported: ${totalImported}, Skipped: ${totalSkipped}`);
      queryClient.invalidateQueries();
      setImportPreviewOpen(false);
      setImportPreviewData(null);
      setImportPreviewMeta(null);
      setImportSelections({});
      setImportExpandedSections(new Set());
    } catch {
      toast.error('Error importing');
    }
  };

  // Handle export download with filtered items
  const handleExportDownload = () => {
    if (!exportPreviewData) return;

    const filteredData: Record<string, unknown[]> = {};
    for (const [key, items] of Object.entries(exportPreviewData)) {
      const selected = exportSelections[key];
      if (selected) {
        const filteredItems = items.filter((_, i) => selected[i]);
        if (filteredItems.length > 0) {
          filteredData[key] = filteredItems;
        }
      }
    }

    if (Object.keys(filteredData).length === 0) {
      toast.error('No items selected');
      return;
    }

    const exportPayload = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      data: filteredData,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hosting-dashboard-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast.success('Export downloaded');
    setExportPreviewOpen(false);
    setExportPreviewData(null);
    setExportSelections({});
    setExportExpandedSections(new Set());
  };

  const handleExport = async (format: 'json' | 'csv' = 'json') => {
    if (format === 'json') {
      // For JSON: fetch data into memory and open preview modal
      try {
        setExportLoading(true);
        const types = exportTypes.join(',');
        const data = await api.get<{ version: string; exportedAt: string; data: Record<string, unknown[]> }>(`/api/backup/export?types=${types}&format=json`);
        if (data?.data) {
          setExportPreviewData(data.data);
          setExportSelections(initializeSelections(data.data));
          setExportExpandedSections(new Set());
          setExportPreviewOpen(true);
        }
      } catch {
        toast.error('Error loading export data');
      } finally {
        setExportLoading(false);
      }
    } else {
      // For CSV: direct download (no preview)
      try {
        const types = exportTypes.join(',');
        const filename = `${exportTypes[0]}-export-${new Date().toISOString().split('T')[0]}.csv`;
        await api.download(`/api/backup/export?types=${types}&format=csv`, filename);
        toast.success('Data exported');
      } catch {
        toast.error('Error exporting');
      }
    }
  };

  const handleDownloadTemplate = async (type: string) => {
    try {
      await api.download(`/api/backup/template/${type}`, `${type}-template.csv`);
      toast.success('Template downloaded');
    } catch {
      toast.error('Error downloading');
    }
  };

  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    const isCSV = file.name.endsWith('.csv');

    setImportFormat(isCSV ? 'csv' : 'json');
    setImportData(content);
    setImportValidation(null);

    // Validate the data
    try {
      if (isCSV) {
        const response = await api.post('/api/backup/validate', {
          type: importType,
          data: content,
          format: 'csv',
        });
        setImportValidation(response as typeof importValidation);
      } else {
        // For JSON, check if it's a full backup or single type
        const parsed = JSON.parse(content);
        if (parsed.version && parsed.data) {
          // Full backup - open preview modal instead of inline validation
          const dataEntries: Record<string, unknown[]> = {};
          for (const [key, value] of Object.entries(parsed.data)) {
            if (Array.isArray(value)) {
              dataEntries[key] = value;
            }
          }
          setImportPreviewData(dataEntries);
          setImportPreviewMeta({
            version: parsed.version,
            exportedAt: parsed.exportedAt,
            fileName: file.name,
          });
          setImportSelections(initializeSelections(dataEntries, false));
          setImportExpandedSections(new Set());
          setImportPreviewOpen(true);
          // Reset file input and return early - no inline validation
          e.target.value = '';
          return;
        } else if (Array.isArray(parsed)) {
          const response = await api.post('/api/backup/validate', {
            type: importType,
            data: parsed,
            format: 'json',
          });
          setImportValidation(response as typeof importValidation);
        }
      }
    } catch (error) {
      setImportValidation({
        valid: false,
        totalRows: 0,
        validRows: 0,
        errors: [{ row: 0, field: '', message: 'Invalid file format' }],
        preview: [],
      });
    }

    // Reset file input
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    if (!importData || !importValidation?.valid) return;

    try {
      let payload;
      if (importFormat === 'csv') {
        payload = { type: importType, data: importData, format: 'csv' };
      } else {
        const parsed = JSON.parse(importData);
        if (parsed.version && parsed.data) {
          payload = parsed;
        } else {
          payload = { type: importType, data: parsed, format: 'json' };
        }
      }

      const result = await api.post('/api/backup/import', payload) as { results: Record<string, { imported: number; skipped: number; errors: string[] }> };
      const totalImported = Object.values(result.results).reduce((sum, r) => sum + r.imported, 0);
      const totalSkipped = Object.values(result.results).reduce((sum, r) => sum + r.skipped, 0);

      toast.success(`Imported: ${totalImported}, Skipped: ${totalSkipped}`);
      queryClient.invalidateQueries();
      setImportData(null);
      setImportValidation(null);
    } catch {
      toast.error('Error importing');
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Logo must be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        uploadLogoMutation.mutate(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSystemSettingsSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    saveSystemSettingsMutation.mutate(systemSettings);
  };

  const handleSecuritySettingsSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    saveSecuritySettingsMutation.mutate(securitySettings);
  };

  const handleMailSettingsSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    saveMailSettingsMutation.mutate(mailSettings);
  };

  const handleCompanyInfoSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    saveCompanyInfoMutation.mutate(companyInfo);
  };

  const handleUserSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const sendInvite = formData.get('sendInvite') === 'on';

    const userData: {
      email: string;
      firstName: string;
      lastName: string;
      phone?: string;
      role: string;
      password?: string;
      sendInvite?: boolean;
      isActive?: boolean;
    } = {
      email: formData.get('email') as string,
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
      phone: formData.get('phone') as string || undefined,
      role: formData.get('role') as string,
    };

    if (selectedUser) {
      // For edit, include isActive
      userData.isActive = formData.get('isActive') === 'on';
    } else {
      // For create, include sendInvite and password
      userData.sendInvite = sendInvite;
      if (!sendInvite && password) {
        userData.password = password;
      }
    }

    if (password && selectedUser) {
      userData.password = password;
    }

    saveUserMutation.mutate(userData);
  };

  const handleMailServerSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    saveMailServerMutation.mutate({
      name: formData.get('name') as string,
      hostname: formData.get('hostname') as string,
      description: formData.get('description') as string || undefined,
      isDefault: formData.get('isDefault') === 'on',
    });
  };

  const handleBankAccountSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    saveBankAccountMutation.mutate({
      bankName: formData.get('bankName') as string,
      accountNumber: formData.get('accountNumber') as string,
      swift: formData.get('swift') as string || undefined,
      iban: formData.get('iban') as string || undefined,
      isDefault: formData.get('isDefault') === 'on',
    });
  };

  const handleMailSecuritySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    saveMailSecurityMutation.mutate({
      name: formData.get('name') as string,
      hostname: formData.get('hostname') as string,
      description: formData.get('description') as string || undefined,
      isDefault: formData.get('isDefault') === 'on',
    });
  };


  const handleTemplatePreview = async (e: React.MouseEvent, template: EmailTemplate) => {
    e.stopPropagation();
    try {
      const response = await api.post<{ html: string }>(`/api/templates/${template.id}/preview`, {
        variables: {
          domainName: 'example.com',
          clientName: 'Test Client',
          expiryDate: '2024-12-31',
          daysUntilExpiry: 7,
        },
      });
      setPreviewHtml(response.html);
      setTemplatePreviewModalOpen(true);
    } catch {
      toast.error('Error loading preview');
    }
  };

  const typeLabels: Record<string, string> = {
    client: 'Client',
    service_request: 'Service Request',
    sales_request: 'Sales Request',
    reports: 'Reports',
    system: 'System',
  };

  // Format schedule for display (positive = before, 0 = day of, negative = after)
  const formatSchedule = (schedule: number[]): string => {
    const before = schedule.filter(d => d > 0).sort((a, b) => b - a);
    const dayOf = schedule.includes(0);
    const after = schedule.filter(d => d < 0).map(d => Math.abs(d)).sort((a, b) => a - b);

    const parts: string[] = [];
    if (before.length > 0) parts.push(`${before.join(', ')}d pre`);
    if (dayOf) parts.push('day expiring');
    if (after.length > 0) parts.push(`${after.join(', ')}d posle`);

    return parts.join(' | ') || 'No schedule';
  };

  const resetNotificationForm = () => {
    setNotificationForm({
      name: '',
      type: 'client',
      schedule: [30, 14, 7, 1, 0],
      runAtTime: '09:00',
      templateId: null,
      recipientType: 'primary',
      customEmail: '',
      includeTechnical: false,
      enabled: true,
      frequency: 'daily',
      dayOfWeek: 1,
      dayOfMonth: 1,
    });
    setSelectedNotification(null);
  };

  const openNotificationModal = (notification?: NotificationSetting) => {
    if (notification) {
      setSelectedNotification(notification);
      setNotificationForm({
        name: notification.name || '',
        type: notification.type,
        schedule: notification.schedule,
        runAtTime: notification.runAtTime || '09:00',
        templateId: notification.templateId || null,
        recipientType: notification.recipientType || 'primary',
        customEmail: notification.customEmail || '',
        includeTechnical: notification.includeTechnical || false,
        enabled: notification.enabled,
        frequency: notification.frequency || 'daily',
        dayOfWeek: notification.dayOfWeek ?? 1,
        dayOfMonth: notification.dayOfMonth ?? 1,
      });
    } else {
      resetNotificationForm();
    }
    setNotificationModalOpen(true);
  };

  // Filter templates by selected notification type
  const filteredTemplatesForNotification = (templatesData?.templates || []).filter(
    (t) => t.type === notificationForm.type
  );

  const handleNotificationSubmit = () => {
    if (selectedNotification) {
      updateNotificationMutation.mutate({
        id: selectedNotification.id,
        data: notificationForm,
        closeModal: true,
      });
    } else {
      createNotificationMutation.mutate(notificationForm);
    }
  };

  const templateTypeLabels: Record<string, string> = {
    client: 'Client',
    service_request: 'Service Request',
    sales_request: 'Sales Request',
    reports: 'Reports',
    system: 'System',
  };

  // Convert template variables to human readable text
  const humanReadableSubject = (subject: string): string => {
    return subject
      .replace(/\{\{clientName\}\}/g, '[Client Name]')
      .replace(/\{\{domainName\}\}/g, '[Domain]')
      .replace(/\{\{expiryDate\}\}/g, '[Expiry Date]')
      .replace(/\{\{daysUntilExpiry\}\}/g, '[Days Left]')
      .replace(/\{\{packageName\}\}/g, '[Package]')
      .replace(/\{\{companyName\}\}/g, '[Company]')
      .replace(/\{\{companyLogo\}\}/g, '[Logo]');
  };

  // Build tabs based on role:
  // - SuperAdmin: all tabs
  // - Admin: all except System, Security, Email (SMTP), Users
  // - SalesAdmin: only Account and Packages
  const tabs = [
    // SuperAdmin only: System settings
    ...(canManageSystem ? [{ id: 'system' as const, label: 'System', icon: Server }] : []),
    // SuperAdmin only: Security settings
    ...(canManageSystem ? [{ id: 'security' as const, label: 'Security', icon: Lock }] : []),
    // All users: My Account (2FA settings)
    { id: 'my-account' as const, label: 'Account', icon: UserIcon },
    // Admin+: Company info
    ...(canManageContent ? [{ id: 'owner' as const, label: 'Company', icon: Building2 }] : []),
    // SuperAdmin only: Email settings (SMTP/IMAP)
    ...(canManageSystem ? [{ id: 'smtp' as const, label: 'Email', icon: Mail }] : []),
    // Admin+: Mail servers
    ...(canManageContent ? [{ id: 'mail-servers' as const, label: 'Servers', icon: HardDrive }] : []),
    // Admin+: Mail security/filters
    ...(canManageContent ? [{ id: 'mail-security' as const, label: 'Mail Security', icon: Shield }] : []),
    // SalesAdmin+: Packages (salesadmin can add, admin can edit/delete)
    ...(isSalesAdmin ? [{ id: 'packages' as const, label: 'Packages', icon: PackageIcon }] : []),
    // Admin+: Notifications
    ...(canManageContent ? [{ id: 'notifications' as const, label: 'Scheduler', icon: Bell }] : []),
    // Admin+: Templates
    ...(canManageContent ? [{ id: 'templates' as const, label: 'Templates', icon: FileText }] : []),
    // Admin+: Backup
    ...(canManageContent ? [{ id: 'import-export' as const, label: 'Import/Export', icon: Database }] : []),
    // SuperAdmin only: Users
    ...(canManageSystem ? [{ id: 'users' as const, label: 'Users', icon: Users }] : []),
  ];

  // Filter functions
  const filteredMailServers = (mailServersData?.servers || []).filter((server) => {
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      return (
        server.name?.toLowerCase().includes(search) ||
        server.hostname?.toLowerCase().includes(search) ||
        server.description?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const filteredMailSecurity = (mailSecurityData?.services || []).filter((service) => {
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      return (
        service.name?.toLowerCase().includes(search) ||
        service.hostname?.toLowerCase().includes(search) ||
        service.description?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const filteredUsers = (usersData?.users || []).filter((user) => {
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      return (
        user.name?.toLowerCase().includes(search) ||
        user.email?.toLowerCase().includes(search) ||
        user.firstName?.toLowerCase().includes(search) ||
        user.lastName?.toLowerCase().includes(search) ||
        user.phone?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const filteredTemplates = (templatesData?.templates || []).filter((tmpl) => {
    // Filter by type
    if (templateTypeFilter !== 'all' && tmpl.type !== templateTypeFilter) {
      return false;
    }
    // Filter by search term
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      return (
        tmpl.name?.toLowerCase().includes(search) ||
        tmpl.subject?.toLowerCase().includes(search) ||
        templateTypeLabels[tmpl.type]?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const filteredNotifications = (notificationSettings?.settings || []).filter((setting) => {
    // Filter by type
    if (notificationTypeFilter !== 'all' && setting.type !== notificationTypeFilter) {
      return false;
    }
    // Filter by search term
    if (notificationSearchTerm.trim()) {
      const search = notificationSearchTerm.toLowerCase();
      return (
        setting.name?.toLowerCase().includes(search) ||
        setting.templateName?.toLowerCase().includes(search) ||
        typeLabels[setting.type]?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const filteredPackages = (packagesData?.packages || []).filter((pkg) => {
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      return (
        pkg.name?.toLowerCase().includes(search) ||
        pkg.description?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Settings
      </h1>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearchTerm(''); }}
              className={`flex items-center py-2 px-2.5 border-b-2 font-medium text-xs transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5 mr-1.5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* System Tab */}
      {activeTab === 'system' && (
        <div className="space-y-4">
          <div className="card !p-4">
            {systemSettingsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
              </div>
            ) : (
              <form onSubmit={handleSystemSettingsSubmit}>
                <div className="grid grid-cols-6 gap-x-3 gap-y-2">
                  <div className="col-span-6">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">System Name</label>
                    <input
                      value={systemSettings.systemName}
                      onChange={(e) => setSystemSettings({ ...systemSettings, systemName: e.target.value })}
                      className="input !py-1.5 !text-sm"
                      placeholder="Hosting Panel"
                    />
                  </div>
                  <div className="col-span-6">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Base URL</label>
                    <input
                      value={systemSettings.baseUrl}
                      onChange={(e) => setSystemSettings({ ...systemSettings, baseUrl: e.target.value })}
                      className="input !py-1.5 !text-sm"
                      placeholder="https://dashboard.example.com"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Public application URL for links in email invitations</p>
                  </div>
                  <div className="col-span-6 flex justify-end pt-2">
                    <button
                      type="submit"
                      className="btn btn-primary !py-1.5 !px-4 !text-sm"
                      disabled={saveSystemSettingsMutation.isPending}
                    >
                      {saveSystemSettingsMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* System Notifications Section (Admin only) */}
          {isAdmin && (
            <div className="card !p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  System Notifications
                </h3>
                <label className="flex items-center text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={systemNotifications.enabled}
                    onChange={(e) => setSystemNotifications(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="mr-2"
                  />
                  Enable
                </label>
              </div>

              {systemNotifications.enabled && (
                <div className="space-y-4">
                  {/* Recipient Email */}
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Recipient Email</label>
                    <input
                      type="email"
                      value={systemNotifications.recipientEmail}
                      onChange={(e) => setSystemNotifications(prev => ({ ...prev, recipientEmail: e.target.value }))}
                      className="input !py-1.5 !text-sm"
                      placeholder="admin@example.com"
                    />
                  </div>

                  {/* Event Toggles */}
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 block">Notify on:</label>
                    <div className="space-y-2">
                      {/* Security Events */}
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                        <div className="text-xs font-medium text-red-700 dark:text-red-300 mb-2">🔒 Security Events</div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={systemNotifications.events.superadminPasswordChange}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, superadminPasswordChange: e.target.checked }
                              }))}
                              className="mr-2"
                            />
                            Superadmin password change
                          </label>
                          <label className="flex items-center text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={systemNotifications.events.adminPasswordChange}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, adminPasswordChange: e.target.checked }
                              }))}
                              className="mr-2"
                            />
                            Admin password change
                          </label>
                          <label className="flex items-center text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={systemNotifications.events.userLocked}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, userLocked: e.target.checked }
                              }))}
                              className="mr-2"
                            />
                            User account locked
                          </label>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={systemNotifications.events.failedLoginAttempts}
                                onChange={(e) => setSystemNotifications(prev => ({
                                  ...prev,
                                  events: { ...prev.events, failedLoginAttempts: e.target.checked }
                                }))}
                                className="mr-2"
                              />
                              Failed logins &gt;
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={systemNotifications.events.failedLoginThreshold}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, failedLoginThreshold: parseInt(e.target.value) || 5 }
                              }))}
                              className="input !py-0.5 !px-2 !text-xs w-14"
                              disabled={!systemNotifications.events.failedLoginAttempts}
                            />
                          </div>
                        </div>
                      </div>

                      {/* System Events */}
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                        <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">💻 System Events</div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={systemNotifications.events.applicationStart}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, applicationStart: e.target.checked }
                              }))}
                              className="mr-2"
                            />
                            Application started
                          </label>
                          <label className="flex items-center text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={systemNotifications.events.applicationStop}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, applicationStop: e.target.checked }
                              }))}
                              className="mr-2"
                            />
                            Application stopped
                          </label>
                          <label className="flex items-center text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={systemNotifications.events.applicationError}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, applicationError: e.target.checked }
                              }))}
                              className="mr-2"
                            />
                            Application errors
                          </label>
                          <label className="flex items-center text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={systemNotifications.events.databaseError}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, databaseError: e.target.checked }
                              }))}
                              className="mr-2"
                            />
                            Database errors
                          </label>
                        </div>
                      </div>

                      {/* Resource Events */}
                      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
                        <div className="text-xs font-medium text-orange-700 dark:text-orange-300 mb-2">📊 Resource Monitoring</div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <label className="flex items-center text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={systemNotifications.events.diskUsageThreshold}
                                onChange={(e) => setSystemNotifications(prev => ({
                                  ...prev,
                                  events: { ...prev.events, diskUsageThreshold: e.target.checked }
                                }))}
                                className="mr-2"
                              />
                              Disk usage &gt;
                            </label>
                            <input
                              type="number"
                              min="50"
                              max="99"
                              value={systemNotifications.events.diskUsagePercent}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, diskUsagePercent: parseInt(e.target.value) || 90 }
                              }))}
                              className="input !py-0.5 !px-2 !text-xs w-14"
                              disabled={!systemNotifications.events.diskUsageThreshold}
                            />
                            <span className="text-xs text-gray-500">%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={systemNotifications.events.cpuUsageThreshold}
                                onChange={(e) => setSystemNotifications(prev => ({
                                  ...prev,
                                  events: { ...prev.events, cpuUsageThreshold: e.target.checked }
                                }))}
                                className="mr-2"
                              />
                              CPU usage &gt;
                            </label>
                            <input
                              type="number"
                              min="50"
                              max="99"
                              value={systemNotifications.events.cpuUsagePercent}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, cpuUsagePercent: parseInt(e.target.value) || 90 }
                              }))}
                              className="input !py-0.5 !px-2 !text-xs w-14"
                              disabled={!systemNotifications.events.cpuUsageThreshold}
                            />
                            <span className="text-xs text-gray-500">%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={systemNotifications.events.memoryUsageThreshold}
                                onChange={(e) => setSystemNotifications(prev => ({
                                  ...prev,
                                  events: { ...prev.events, memoryUsageThreshold: e.target.checked }
                                }))}
                                className="mr-2"
                              />
                              Memory usage &gt;
                            </label>
                            <input
                              type="number"
                              min="50"
                              max="99"
                              value={systemNotifications.events.memoryUsagePercent}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, memoryUsagePercent: parseInt(e.target.value) || 90 }
                              }))}
                              className="input !py-0.5 !px-2 !text-xs w-14"
                              disabled={!systemNotifications.events.memoryUsageThreshold}
                            />
                            <span className="text-xs text-gray-500">%</span>
                          </div>
                        </div>
                      </div>

                      {/* Maintenance Events */}
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                        <div className="text-xs font-medium text-green-700 dark:text-green-300 mb-2">🔧 Maintenance</div>
                        <div className="space-y-2">
                          <label className="flex items-center text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={systemNotifications.events.backupCompleted}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, backupCompleted: e.target.checked }
                              }))}
                              className="mr-2"
                            />
                            Backup completed
                          </label>
                          <label className="flex items-center text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={systemNotifications.events.backupFailed}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, backupFailed: e.target.checked }
                              }))}
                              className="mr-2"
                            />
                            Backup failed
                          </label>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={systemNotifications.events.sslCertExpiring}
                                onChange={(e) => setSystemNotifications(prev => ({
                                  ...prev,
                                  events: { ...prev.events, sslCertExpiring: e.target.checked }
                                }))}
                                className="mr-2"
                              />
                              SSL cert expiring in
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="90"
                              value={systemNotifications.events.sslCertExpiringDays}
                              onChange={(e) => setSystemNotifications(prev => ({
                                ...prev,
                                events: { ...prev.events, sslCertExpiringDays: parseInt(e.target.value) || 14 }
                              }))}
                              className="input !py-0.5 !px-2 !text-xs w-14"
                              disabled={!systemNotifications.events.sslCertExpiring}
                            />
                            <span className="text-xs text-gray-500">days</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => saveSystemNotificationsMutation.mutate(systemNotifications)}
                      className="btn btn-primary !py-1.5 !px-4 !text-sm"
                      disabled={saveSystemNotificationsMutation.isPending || !systemNotifications.recipientEmail}
                    >
                      {saveSystemNotificationsMutation.isPending ? 'Saving...' : 'Save Notifications'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Security Tab (Admin only) */}
      {activeTab === 'security' && isAdmin && (
        <div className="space-y-4">
          {/* 2FA and Fail2Ban Settings */}
          <div className="card !p-3">
            {securitySettingsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
              </div>
            ) : (
              <form onSubmit={handleSecuritySettingsSubmit}>
                <div className="grid grid-cols-6 gap-x-3 gap-y-3">
                  {/* 2FA Settings - compact row */}
                  <div className="col-span-6 flex items-center gap-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                      <KeyRound className="w-4 h-4" />
                      2FA
                    </div>
                    <select
                      value={securitySettings.twoFactorEnforcement}
                      onChange={(e) => setSecuritySettings({ ...securitySettings, twoFactorEnforcement: e.target.value as SecuritySettings['twoFactorEnforcement'] })}
                      className="input !py-1 !text-xs flex-1 max-w-xs"
                    >
                      <option value="disabled">Disabled</option>
                      <option value="optional">Optional</option>
                      <option value="required_admins">Required for Admins</option>
                      <option value="required_all">Required for All</option>
                    </select>
                    <div className="flex items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={securitySettings.twoFactorMethods.includes('email')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSecuritySettings({ ...securitySettings, twoFactorMethods: [...securitySettings.twoFactorMethods, 'email'] });
                            } else {
                              setSecuritySettings({ ...securitySettings, twoFactorMethods: securitySettings.twoFactorMethods.filter(m => m !== 'email') });
                            }
                          }}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                        />
                        <span className="text-gray-700 dark:text-gray-300">Email</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={securitySettings.twoFactorMethods.includes('totp')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSecuritySettings({ ...securitySettings, twoFactorMethods: [...securitySettings.twoFactorMethods, 'totp'] });
                            } else {
                              setSecuritySettings({ ...securitySettings, twoFactorMethods: securitySettings.twoFactorMethods.filter(m => m !== 'totp') });
                            }
                          }}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                        />
                        <span className="text-gray-700 dark:text-gray-300">TOTP</span>
                      </label>
                    </div>
                  </div>

                  {/* Fail2Ban Settings */}
                  <div className="col-span-6 flex items-center gap-2 pt-1">
                    <Shield className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Fail2Ban</span>
                  </div>

                  <div className="col-span-2">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Max Login Attempts</label>
                    <input
                      type="number"
                      value={securitySettings.maxLoginAttempts}
                      onChange={(e) => setSecuritySettings({ ...securitySettings, maxLoginAttempts: parseInt(e.target.value) || 3 })}
                      min={1}
                      max={20}
                      className="input !py-1.5 !text-sm"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Before temporary block</p>
                  </div>

                  <div className="col-span-2">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Lockout Duration (min)</label>
                    <input
                      type="number"
                      value={securitySettings.lockoutMinutes}
                      onChange={(e) => setSecuritySettings({ ...securitySettings, lockoutMinutes: parseInt(e.target.value) || 10 })}
                      min={1}
                      max={1440}
                      className="input !py-1.5 !text-sm"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Temporary block duration</p>
                  </div>

                  <div className="col-span-2">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Permanent Block After</label>
                    <input
                      type="number"
                      value={securitySettings.permanentBlockAttempts}
                      onChange={(e) => setSecuritySettings({ ...securitySettings, permanentBlockAttempts: parseInt(e.target.value) || 10 })}
                      min={5}
                      max={100}
                      className="input !py-1.5 !text-sm"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Total failed attempts</p>
                  </div>

                  {/* Password Policy */}
                  <div className="col-span-6 flex items-center gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-700">
                    <Lock className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Password Policy</span>
                  </div>

                  <div className="col-span-2">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Min Length</label>
                    <input
                      type="number"
                      value={securitySettings.passwordMinLength}
                      onChange={(e) => setSecuritySettings({ ...securitySettings, passwordMinLength: parseInt(e.target.value) || 8 })}
                      min={6}
                      max={32}
                      className="input !py-1.5 !text-sm"
                    />
                  </div>

                  <div className="col-span-4 flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={securitySettings.passwordRequireUppercase}
                        onChange={(e) => setSecuritySettings({ ...securitySettings, passwordRequireUppercase: e.target.checked })}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Uppercase (A-Z)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={securitySettings.passwordRequireLowercase}
                        onChange={(e) => setSecuritySettings({ ...securitySettings, passwordRequireLowercase: e.target.checked })}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Lowercase (a-z)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={securitySettings.passwordRequireNumbers}
                        onChange={(e) => setSecuritySettings({ ...securitySettings, passwordRequireNumbers: e.target.checked })}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Numbers (0-9)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={securitySettings.passwordRequireSpecial}
                        onChange={(e) => setSecuritySettings({ ...securitySettings, passwordRequireSpecial: e.target.checked })}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Special (!@#$%)</span>
                    </label>
                  </div>

                  <div className="col-span-6 flex justify-end pt-2">
                    <button
                      type="submit"
                      className="btn btn-primary !py-1.5 !px-4 !text-sm"
                      disabled={saveSecuritySettingsMutation.isPending}
                    >
                      {saveSecuritySettingsMutation.isPending ? 'Saving...' : 'Save Security Settings'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Blocked IPs and Locked Users - Side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Blocked IPs */}
            <div className="card !p-3">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-500" />
                Blocked IPs
              </h3>
              {blockedIpsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                </div>
              ) : blockedIpsData?.blocked && blockedIpsData.blocked.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {blockedIpsData.blocked.map((ip) => (
                    <div key={ip.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-gray-900 dark:text-gray-100">{ip.ipAddress}</div>
                        <div className="text-gray-500 truncate">
                          {ip.permanent ? (
                            <span className="text-red-600 dark:text-red-400">Permanent</span>
                          ) : ip.blockedUntil ? (
                            `Until: ${new Date(ip.blockedUntil).toLocaleString('sr-RS')}`
                          ) : ip.reason || 'Blocked'}
                        </div>
                      </div>
                      <button
                        onClick={() => unblockIpMutation.mutate(ip.ipAddress)}
                        disabled={unblockIpMutation.isPending}
                        className="ml-2 px-2 py-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                  No blocked IPs
                </p>
              )}
            </div>

            {/* Locked Users */}
            <div className="card !p-3">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <Lock className="w-4 h-4 text-orange-500" />
                Locked Users
              </h3>
              {lockedUsersLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                </div>
              ) : lockedUsersData?.lockedUsers && lockedUsersData.lockedUsers.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {lockedUsersData.lockedUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{user.name}</div>
                        <div className="text-gray-500 truncate">{user.email}</div>
                        <div className="text-gray-400">
                          {user.lockedUntil ? (
                            <span className="text-orange-600 dark:text-orange-400">
                              Locked until: {new Date(user.lockedUntil).toLocaleString('sr-RS')}
                            </span>
                          ) : user.failedLoginAttempts > 0 ? (
                            <span>Failed attempts: {user.failedLoginAttempts}</span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        onClick={() => unlockUserMutation.mutate(user.id)}
                        disabled={unlockUserMutation.isPending}
                        className="ml-2 px-2 py-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded"
                      >
                        Unlock
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                  No locked users
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* My Account Tab */}
      {activeTab === 'my-account' && (
        <div className="space-y-4">
          <div className="card !p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Two-Factor Authentication
            </h3>

            {my2FALoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      Status: {my2FAStatus?.enabled ? (
                        <span className="text-green-600 dark:text-green-400">Enabled</span>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">Disabled</span>
                      )}
                    </div>
                    {my2FAStatus?.enabled && my2FAStatus.method && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Method: {my2FAStatus.method === 'email' ? 'Email Code' : 'Authenticator App'}
                      </div>
                    )}
                  </div>

                  {my2FAStatus?.enabled ? (
                    <div className="flex gap-2">
                      {my2FAStatus.method === 'totp' && (
                        <button
                          onClick={() => regenerateBackupCodesMutation.mutate()}
                          disabled={regenerateBackupCodesMutation.isPending}
                          className="btn btn-secondary !py-1.5 !px-3 !text-sm"
                        >
                          {regenerateBackupCodesMutation.isPending ? 'Generating...' : 'Regenerate Backup Codes'}
                        </button>
                      )}
                      <button
                        onClick={() => setDisable2FAModalOpen(true)}
                        className="btn !py-1.5 !px-3 !text-sm bg-red-600 hover:bg-red-700 text-white"
                      >
                        Disable 2FA
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        resetSetup2FAState();
                        setSetup2FAModalOpen(true);
                      }}
                      className="btn btn-primary !py-1.5 !px-3 !text-sm"
                    >
                      Enable 2FA
                    </button>
                  )}
                </div>

                {!my2FAStatus?.enabled && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Two-factor authentication adds an extra layer of security to your account by requiring a verification code in addition to your password.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Backup Codes Display (after regeneration) */}
          {backupCodesToShow.length > 0 && (
            <div className="card !p-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
                Your Backup Codes
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Save these codes in a safe place. Each code can only be used once.
              </p>
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-4">
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {backupCodesToShow.map((code, index) => (
                    <div key={index} className="text-center py-1 text-gray-700 dark:text-gray-300">
                      {code}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(backupCodesToShow.join('\n'));
                    toast.success('Backup codes copied');
                  }}
                  className="btn btn-secondary !py-1.5 !px-3 !text-sm flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Copy Codes
                </button>
                <button
                  onClick={() => setBackupCodesToShow([])}
                  className="btn btn-primary !py-1.5 !px-3 !text-sm"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Setup 2FA Modal */}
      <Modal
        isOpen={setup2FAModalOpen}
        onClose={() => {
          setSetup2FAModalOpen(false);
          resetSetup2FAState();
        }}
        title="Enable Two-Factor Authentication"
      >
        {setup2FAStep === 'choose' ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Choose your preferred 2FA method:
            </p>

            <button
              onClick={() => {
                setSetup2FAMethod('email');
                setupEmail2FAMutation.mutate();
              }}
              disabled={setupEmail2FAMutation.isPending}
              className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center gap-4 text-left"
            >
              <Mail className="w-8 h-8 text-primary-600" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Email Code</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Receive a code via email each time you log in</div>
              </div>
            </button>

            <button
              onClick={() => {
                setSetup2FAMethod('totp');
                setupTOTP2FAMutation.mutate();
              }}
              disabled={setupTOTP2FAMutation.isPending}
              className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center gap-4 text-left"
            >
              <Shield className="w-8 h-8 text-primary-600" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Authenticator App</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Use Google Authenticator or similar app</div>
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {setup2FAMethod === 'totp' && totpSetupData && (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Scan this QR code with your authenticator app:
                </p>
                <div className="flex justify-center">
                  <img src={totpSetupData.qrCode} alt="QR Code" />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Or enter manually: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{totpSetupData.secret}</code>
                </p>
              </>
            )}

            {setup2FAMethod === 'email' && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enter the verification code sent to your email:
              </p>
            )}

            <div>
              <label className="label">Verification Code</label>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className="input text-center tracking-widest text-lg"
                placeholder="000000"
                maxLength={6}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setSetup2FAStep('choose')}
                className="btn btn-secondary flex-1"
              >
                Back
              </button>
              <button
                onClick={() => {
                  if (setup2FAMethod === 'email') {
                    verifyEmail2FAMutation.mutate(verificationCode);
                  } else {
                    verifyTOTP2FAMutation.mutate(verificationCode);
                  }
                }}
                disabled={verifyEmail2FAMutation.isPending || verifyTOTP2FAMutation.isPending || !verificationCode}
                className="btn btn-primary flex-1"
              >
                {verifyEmail2FAMutation.isPending || verifyTOTP2FAMutation.isPending ? 'Verifying...' : 'Verify & Enable'}
              </button>
            </div>
          </div>
        )}

        {/* Show backup codes after TOTP setup */}
        {backupCodesToShow.length > 0 && setup2FAModalOpen && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Save Your Backup Codes</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              These codes can be used to access your account if you lose your authenticator device.
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-4">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {backupCodesToShow.map((code, index) => (
                  <div key={index} className="text-center py-1 text-gray-700 dark:text-gray-300">
                    {code}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(backupCodesToShow.join('\n'));
                  toast.success('Backup codes copied');
                }}
                className="btn btn-secondary flex-1 flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              <button
                onClick={() => {
                  setSetup2FAModalOpen(false);
                  resetSetup2FAState();
                }}
                className="btn btn-primary flex-1"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Disable 2FA Modal */}
      <Modal
        isOpen={disable2FAModalOpen}
        onClose={() => {
          setDisable2FAModalOpen(false);
          setDisablePassword('');
        }}
        title="Disable Two-Factor Authentication"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Enter your password to confirm disabling 2FA. This will make your account less secure.
          </p>

          <div>
            <label className="label">Password</label>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              className="input"
              placeholder="Enter your password"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setDisable2FAModalOpen(false);
                setDisablePassword('');
              }}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              onClick={() => disable2FAMutation.mutate(disablePassword)}
              disabled={disable2FAMutation.isPending || !disablePassword}
              className="btn flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {disable2FAMutation.isPending ? 'Disabling...' : 'Disable 2FA'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Owner Tab */}
      {activeTab === 'owner' && (
        <div className="space-y-4">
          {companyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : (
            <>
              {/* Company Info */}
              <div className="card !p-4">
                <form onSubmit={handleCompanyInfoSubmit}>
                  <div className="flex gap-4">
                    {/* Logo */}
                    <div className="flex-shrink-0">
                      {companyInfo.logo ? (
                        <div className="relative group">
                          <img src={companyInfo.logo} alt="Logo" className="w-24 h-24 object-contain bg-gray-50 dark:bg-gray-800 rounded-lg" />
                          <button type="button" onClick={() => deleteLogoMutation.mutate()} className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                            <Trash2 className="w-5 h-5 text-white" />
                          </button>
                        </div>
                      ) : (
                        <div onClick={() => logoInputRef.current?.click()} className="w-24 h-24 bg-gray-50 dark:bg-gray-800 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                          <Image className="w-6 h-6 text-gray-400" />
                          <span className="text-xs text-gray-400 mt-1">Upload</span>
                        </div>
                      )}
                      <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </div>

                    {/* Form Grid */}
                    <div className="flex-1 grid grid-cols-6 gap-x-3 gap-y-2">
                      {/* Row 1: Company Name + Website */}
                      <div className="col-span-3">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">Company Name *</label>
                        <input value={companyInfo.name || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, name: e.target.value })} className="input !py-1.5 !text-sm" required />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">Website</label>
                        <input value={companyInfo.website || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, website: e.target.value })} className="input !py-1.5 !text-sm" placeholder="https://" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">PIB</label>
                        <input value={companyInfo.pib || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, pib: e.target.value })} className="input !py-1.5 !text-sm" />
                      </div>

                      {/* Row 2: Address + Email */}
                      <div className="col-span-3">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">Address</label>
                        <input value={companyInfo.address || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })} className="input !py-1.5 !text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">Email</label>
                        <input type="email" value={companyInfo.email || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, email: e.target.value })} className="input !py-1.5 !text-sm" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">MIB</label>
                        <input value={companyInfo.mib || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, mib: e.target.value })} className="input !py-1.5 !text-sm" />
                      </div>

                      {/* Row 3: City/Postal/Country + Phones */}
                      <div className="col-span-1">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">Postal Code</label>
                        <input value={companyInfo.postalCode || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, postalCode: e.target.value })} className="input !py-1.5 !text-sm" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">City</label>
                        <input value={companyInfo.city || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, city: e.target.value })} className="input !py-1.5 !text-sm" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">Country</label>
                        <input value={companyInfo.country || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, country: e.target.value })} className="input !py-1.5 !text-sm" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">Phone</label>
                        <input value={companyInfo.phone || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })} className="input !py-1.5 !text-sm" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between">
                          Phone 2
                          {!companyInfo.phone2 && <span className="text-[10px] text-gray-400 italic">optional</span>}
                        </label>
                        <input value={companyInfo.phone2 || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, phone2: e.target.value })} className="input !py-1.5 !text-sm" />
                      </div>
                      <div className="col-span-1"></div>

                      {/* Divider */}
                      <div className="col-span-6 border-t border-gray-200 dark:border-gray-700 my-1"></div>

                      {/* Row 4: Primary Contact */}
                      <div className="col-span-6 flex items-center gap-3">
                        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20 flex-shrink-0">Primary</span>
                        <div className="flex-1 grid grid-cols-3 gap-3">
                          <input value={companyInfo.contactName || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, contactName: e.target.value })} className="input !py-1.5 !text-sm" placeholder="Name" />
                          <input value={companyInfo.contactPhone || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, contactPhone: e.target.value })} className="input !py-1.5 !text-sm" placeholder="Phone" />
                          <input type="email" value={companyInfo.contactEmail || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, contactEmail: e.target.value })} className="input !py-1.5 !text-sm" placeholder="Email" />
                        </div>
                      </div>

                      {/* Row 5: Technical Contact */}
                      <div className="col-span-6 flex items-center gap-3">
                        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20 flex-shrink-0">Technical</span>
                        <div className="flex-1 grid grid-cols-3 gap-3">
                          <input value={companyInfo.techContactName || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, techContactName: e.target.value })} className="input !py-1.5 !text-sm" placeholder="Name" />
                          <input value={companyInfo.techContactPhone || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, techContactPhone: e.target.value })} className="input !py-1.5 !text-sm" placeholder="Phone" />
                          <input type="email" value={companyInfo.techContactEmail || ''} onChange={(e) => setCompanyInfo({ ...companyInfo, techContactEmail: e.target.value })} className="input !py-1.5 !text-sm" placeholder="Email" />
                        </div>
                      </div>

                      {/* Save Button */}
                      <div className="col-span-6 flex justify-end pt-2">
                        <button type="submit" className="btn btn-primary !py-1.5 !px-4 !text-sm" disabled={saveCompanyInfoMutation.isPending}>
                          {saveCompanyInfoMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>

              {/* Bank Accounts */}
              <div className="card !p-0 overflow-hidden">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold">Bank Accounts</h2>
                  <button onClick={() => { setSelectedBankAccount(null); setBankAccountModalOpen(true); }} className="btn btn-primary btn-sm flex items-center">
                    <Plus className="w-3 h-3 mr-1" /> Add
                  </button>
                </div>
                {bankAccountsLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary-600" /></div>
                ) : (bankAccountsData?.accounts || []).length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-500">No bank accounts</div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {(bankAccountsData?.accounts || []).map((account) => (
                      <div key={account.id} onClick={() => { setSelectedBankAccount(account); setBankAccountModalOpen(true); }} className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors">
                        <div className="flex items-center gap-2 flex-1 min-w-0 text-sm">
                          <CreditCard className="w-4 h-4 text-primary-600 flex-shrink-0" />
                          <span className="font-medium">{account.bankName}</span>
                          <span className="text-gray-400">|</span>
                          <span className="text-gray-600 dark:text-gray-400">{account.accountNumber}</span>
                          {account.swift && <><span className="text-gray-400">|</span><span className="text-gray-500">SWIFT: {account.swift}</span></>}
                          {account.isDefault && <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"><Star className="w-2.5 h-2.5 mr-0.5" />Default</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {!account.isDefault && <button onClick={(e) => { e.stopPropagation(); setDefaultBankAccountMutation.mutate(account.id); }} className="p-1.5 text-gray-400 hover:text-yellow-600 rounded" title="Set default"><Star className="w-3.5 h-3.5" /></button>}
                          <button onClick={(e) => { e.stopPropagation(); setSelectedBankAccount(account); setBankAccountModalOpen(true); }} className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"><Pencil className="w-3 h-3" />Edit</button>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedBankAccount(account); setDeleteBankAccountDialogOpen(true); }} className="!text-xs !py-1 !px-2 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* IMAP/SMTP Tab */}
      {activeTab === 'smtp' && (
        <div className="space-y-4">
          <div className="card !p-4">
            {mailSettingsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
              </div>
            ) : (
              <form onSubmit={handleMailSettingsSubmit}>
                <div className="grid grid-cols-6 gap-x-3 gap-y-2">
                  {/* Row 1: Server */}
                  <div className="col-span-6">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Mail Server *</label>
                    <input
                      value={mailSettings.host}
                      onChange={(e) => setMailSettings({ ...mailSettings, host: e.target.value })}
                      className="input !py-1.5 !text-sm"
                      placeholder="mail.example.com"
                      required
                    />
                  </div>

                  {/* Row 2: SMTP Port + SSL | IMAP Port + SSL */}
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">SMTP Port *</label>
                        <input
                          type="number"
                          value={mailSettings.port}
                          onChange={(e) => setMailSettings({ ...mailSettings, port: parseInt(e.target.value) || 587 })}
                          className="input !py-1.5 !text-sm"
                          placeholder="587"
                          required
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={mailSettings.secure}
                            onChange={(e) => setMailSettings({ ...mailSettings, secure: e.target.checked })}
                            className="mr-1.5"
                          />
                          SSL/TLS
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">IMAP Port</label>
                        <input
                          type="number"
                          value={mailSettings.imapPort}
                          onChange={(e) => setMailSettings({ ...mailSettings, imapPort: parseInt(e.target.value) || 993 })}
                          className="input !py-1.5 !text-sm"
                          placeholder="993"
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={mailSettings.imapSecure}
                            onChange={(e) => setMailSettings({ ...mailSettings, imapSecure: e.target.checked })}
                            className="mr-1.5"
                          />
                          SSL/TLS
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Username + Password */}
                  <div className="col-span-3">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Username</label>
                    <input
                      value={mailSettings.user}
                      onChange={(e) => setMailSettings({ ...mailSettings, user: e.target.value })}
                      className="input !py-1.5 !text-sm"
                      placeholder="user@example.com"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={mailSettings.password}
                        onChange={(e) => setMailSettings({ ...mailSettings, password: e.target.value })}
                        className="input !py-1.5 !text-sm pr-10"
                        placeholder="********"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Row 4: From Email + From Name */}
                  <div className="col-span-3">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">From Email *</label>
                    <input
                      type="email"
                      value={mailSettings.fromEmail}
                      onChange={(e) => setMailSettings({ ...mailSettings, fromEmail: e.target.value })}
                      className="input !py-1.5 !text-sm"
                      placeholder="noreply@example.com"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">From Name</label>
                    <input
                      value={mailSettings.fromName}
                      onChange={(e) => setMailSettings({ ...mailSettings, fromName: e.target.value })}
                      className="input !py-1.5 !text-sm"
                      placeholder="Hosting Panel"
                    />
                  </div>

                  {/* Buttons */}
                  <div className="col-span-6 flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => verifySmtpMutation.mutate()}
                      className="btn btn-secondary !py-1.5 !px-3 !text-sm flex items-center"
                      disabled={verifySmtpMutation.isPending}
                    >
                      {verifySmtpMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Test SMTP
                    </button>
                    <button
                      type="button"
                      onClick={() => verifyImapMutation.mutate()}
                      className="btn btn-secondary !py-1.5 !px-3 !text-sm flex items-center"
                      disabled={verifyImapMutation.isPending || !mailSettings.imapPort}
                    >
                      {verifyImapMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Test IMAP
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary !py-1.5 !px-4 !text-sm"
                      disabled={saveMailSettingsMutation.isPending}
                    >
                      {saveMailSettingsMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Test Email */}
          <div className="card !p-4">
            <div className="flex items-center gap-3">
              <label className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">Test Email</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="input !py-1.5 !text-sm flex-1"
              />
              <button
                onClick={() => testEmail && saveTestEmailMutation.mutate(testEmail)}
                disabled={!testEmail || saveTestEmailMutation.isPending}
                className="btn btn-secondary !py-1.5 !px-3 !text-sm flex items-center"
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {saveTestEmailMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => testEmail && testSmtpMutation.mutate(testEmail)}
                disabled={!testEmail || testSmtpMutation.isPending}
                className="btn btn-primary !py-1.5 !px-3 !text-sm flex items-center"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {testSmtpMutation.isPending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mail Servers Tab */}
      {activeTab === 'mail-servers' && (
        <div className="space-y-4">
          <div className="card !p-0 overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="input !py-1.5 !text-sm w-full pl-8"
                />
              </div>
              <button
                onClick={() => { setSelectedMailServer(null); setMailServerModalOpen(true); }}
                className="btn btn-primary btn-sm flex items-center"
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </button>
            </div>
            {mailServersLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary-600" /></div>
            ) : filteredMailServers.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                {searchTerm ? 'No results' : 'No mail servers'}
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredMailServers.map((server) => (
                  <div
                    key={server.id}
                    onClick={() => { setSelectedMailServer(server); setMailServerModalOpen(true); }}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0 text-sm">
                      <HardDrive className="w-4 h-4 text-primary-600 flex-shrink-0" />
                      <span className="font-medium">{server.name}</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-gray-600 dark:text-gray-400">{server.hostname}</span>
                      {server.description && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-gray-500 truncate">{server.description}</span>
                        </>
                      )}
                      {server.isDefault && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
                          <Star className="w-2.5 h-2.5 mr-0.5" />Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!server.isDefault && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDefaultMailServerMutation.mutate(server.id); }}
                          className="p-1.5 text-gray-400 hover:text-yellow-600 rounded"
                          title="Set as default"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedMailServer(server); setMailServerModalOpen(true); }}
                        className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"
                      >
                        <Pencil className="w-3 h-3" />Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedMailServer(server); setDeleteMailServerDialogOpen(true); }}
                        className="!text-xs !py-1 !px-2 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mail Security Tab */}
      {activeTab === 'mail-security' && (
        <div className="space-y-4">
          <div className="card !p-0 overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="input !py-1.5 !text-sm w-full pl-8"
                />
              </div>
              <button
                onClick={() => { setSelectedMailSecurity(null); setMailSecurityModalOpen(true); }}
                className="btn btn-primary btn-sm flex items-center"
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </button>
            </div>
            {mailSecurityLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary-600" /></div>
            ) : filteredMailSecurity.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                {searchTerm ? 'No results' : 'No mail security services'}
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredMailSecurity.map((service) => (
                  <div
                    key={service.id}
                    onClick={() => { setSelectedMailSecurity(service); setMailSecurityModalOpen(true); }}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0 text-sm">
                      <Shield className="w-4 h-4 text-primary-600 flex-shrink-0" />
                      <span className="font-medium">{service.name}</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-gray-600 dark:text-gray-400">{service.hostname}</span>
                      {service.description && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-gray-500 truncate">{service.description}</span>
                        </>
                      )}
                      {service.isDefault && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
                          <Star className="w-2.5 h-2.5 mr-0.5" />Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!service.isDefault && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDefaultMailSecurityMutation.mutate(service.id); }}
                          className="p-1.5 text-gray-400 hover:text-yellow-600 rounded"
                          title="Set as default"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedMailSecurity(service); setMailSecurityModalOpen(true); }}
                        className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"
                      >
                        <Pencil className="w-3 h-3" />Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedMailSecurity(service); setDeleteMailSecurityDialogOpen(true); }}
                        className="!text-xs !py-1 !px-2 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Packages Tab */}
      {activeTab === 'packages' && (
        <div className="card !p-0 overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="input !py-1.5 !text-sm w-full pl-8"
              />
            </div>
            <button
              onClick={() => {
                setSelectedPackage(null);
                const defaultServer = mailServersData?.servers?.find(s => s.isDefault);
                const defaultSecurity = mailSecurityData?.services?.find(s => s.isDefault);
                setSelectedMailServerId(defaultServer?.id || null);
                setSelectedMailSecurityId(defaultSecurity?.id || null);
                setPackageModalOpen(true);
              }}
              className="btn btn-primary btn-sm flex items-center"
            >
              <Plus className="w-3 h-3 mr-1" /> Add
            </button>
          </div>
          {packagesLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary-600" /></div>
          ) : filteredPackages.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">
              {searchTerm ? 'No results' : 'No packages'}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  onClick={() => {
                    if (canEditPackages) {
                      setSelectedPackage(pkg);
                      setSelectedMailServerId(pkg.mailServerId || null);
                      setSelectedMailSecurityId(pkg.mailSecurityId || null);
                      setPackageModalOpen(true);
                    }
                  }}
                  className={`flex items-center justify-between px-4 py-3 transition-colors ${canEditPackages ? 'cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50' : ''}`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0 text-sm flex-wrap">
                    <PackageIcon className="w-4 h-4 text-primary-600 flex-shrink-0" />
                    <span className="font-medium">{pkg.name}</span>
                    {pkg.description && (
                      <>
                        <span className="text-gray-400">|</span>
                        <span className="text-gray-500">{pkg.description}</span>
                      </>
                    )}
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-600 dark:text-gray-400">{pkg.maxMailboxes} mailboxes</span>
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-600 dark:text-gray-400">{pkg.storageGb} GB</span>
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-600 dark:text-gray-400">{pkg.price} RSD</span>
                    {pkg.mailServerName && (
                      <>
                        <span className="text-gray-400">|</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                          <HardDrive className="w-2.5 h-2.5 mr-0.5" />{pkg.mailServerName}
                        </span>
                      </>
                    )}
                    {pkg.mailSecurityName && (
                      <>
                        <span className="text-gray-400">|</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                          <Shield className="w-2.5 h-2.5 mr-0.5" />{pkg.mailSecurityName}
                        </span>
                      </>
                    )}
                  </div>
                  {canEditPackages && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPackage(pkg);
                          setSelectedMailServerId(pkg.mailServerId || null);
                          setSelectedMailSecurityId(pkg.mailSecurityId || null);
                          setPackageModalOpen(true);
                        }}
                        className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedPackage(pkg); setDeletePackageDialogOpen(true); }}
                        className="!text-xs !py-1 !px-2 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="card !p-0 overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={notificationSearchTerm}
                onChange={(e) => setNotificationSearchTerm(e.target.value)}
                placeholder="Search..."
                className="input !py-1.5 !text-sm w-full pl-8"
              />
            </div>
            <button
              onClick={() => openNotificationModal()}
              className="btn btn-primary btn-sm flex items-center"
            >
              <Plus className="w-3 h-3 mr-1" /> Add
            </button>
          </div>
          {/* Type filters */}
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 dark:text-gray-400">Filter:</span>
            {['all', 'client', 'service_request', 'sales_request', 'reports', 'system'].map((type) => (
              <button
                key={type}
                onClick={() => setNotificationTypeFilter(type)}
                className={`px-2 py-1 text-xs rounded border transition-colors ${
                  notificationTypeFilter === type
                    ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:border-primary-500 dark:text-primary-300'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                {type === 'all' ? 'All' : typeLabels[type] || type}
              </button>
            ))}
          </div>
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">
              {notificationSearchTerm || notificationTypeFilter !== 'all' ? 'No results' : 'No notifications configured'}
            </div>
          ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredNotifications.map((setting) => (
              <div
                key={setting.id}
                onClick={() => openNotificationModal(setting)}
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0 text-sm">
                  <Bell className="w-4 h-4 text-primary-600 flex-shrink-0" />
                  <span className="font-medium">{setting.name || typeLabels[setting.type]}</span>
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-500">Type:</span>
                  <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700">
                    {typeLabels[setting.type]}
                  </span>
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-500 truncate">
                    {setting.templateName || 'No template'}
                  </span>
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-500">
                    {(setting.type === 'reports' || setting.type === 'system') ? (
                      <>
                        {(() => {
                          const freq = setting.frequency || 'daily';
                          const time = setting.runAtTime || '09:00';
                          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                          if (freq === 'weekly') return `Weekly (${dayNames[setting.dayOfWeek ?? 1]}) @ ${time}`;
                          if (freq === 'monthly') {
                            const d = setting.dayOfMonth ?? 1;
                            const suffix = (d >= 11 && d <= 13) ? 'th' : ['th','st','nd','rd'][d % 10] || 'th';
                            return `Monthly (${d}${suffix}) @ ${time}`;
                          }
                          return `Daily @ ${time}`;
                        })()}
                      </>
                    ) : (
                      <>Schedule: {setting.schedule.length > 0 ? formatSchedule(setting.schedule) : 'None'} @ {setting.runAtTime || '09:00'}</>
                    )}
                  </span>
                  <span className="text-gray-400">|</span>
                  {setting.enabled ? (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Active</span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">Inactive</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (testEmail) {
                        testNotificationMutation.mutate({ id: setting.id, email: testEmail });
                      } else {
                        toast.error('Enter test email in SMTP settings');
                      }
                    }}
                    disabled={testNotificationMutation.isPending}
                    className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-blue-50 text-blue-700 border border-blue-300 hover:bg-blue-200 hover:border-blue-400 active:bg-blue-300 active:scale-[0.97] dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/50 dark:hover:bg-blue-500/40 dark:hover:border-blue-400/70 dark:active:bg-blue-500/50 transition-all duration-150"
                  >
                    <Send className="w-3 h-3" />
                    Test
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openNotificationModal(setting); }}
                    className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyNotificationMutation.mutate(setting); }}
                    disabled={copyNotificationMutation.isPending}
                    className="btn btn-secondary !text-xs !py-1 !px-2 flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedNotification(setting); setDeleteNotificationDialogOpen(true); }}
                    className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="card !p-0 overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="input !py-1.5 !text-sm w-full pl-8"
                />
              </div>
              <button
                onClick={() => openTemplateModal(null)}
                className="btn btn-primary btn-sm flex items-center"
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </button>
            </div>
            {/* Type Filters */}
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Filter:</span>
              <button
                onClick={() => setTemplateTypeFilter('all')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  templateTypeFilter === 'all'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                All
              </button>
              {Object.entries(templateTypeLabels).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setTemplateTypeFilter(value)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    templateTypeFilter === value
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {templatesLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary-600" /></div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                {searchTerm ? 'No results' : 'No templates'}
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredTemplates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    onClick={() => openTemplateModal(tmpl)}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0 text-sm">
                      <Mail className="w-4 h-4 text-primary-600 flex-shrink-0" />
                      <span className="font-medium">{tmpl.name}</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-gray-500">Type:</span>
                      <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700">
                        {templateTypeLabels[tmpl.type] || tmpl.type}
                      </span>
                      <span className="text-gray-400">|</span>
                      <span className="text-gray-500">Subject: {humanReadableSubject(tmpl.subject)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (testEmail) {
                            testTemplateMutation.mutate({ id: tmpl.id, email: testEmail });
                          } else {
                            toast.error('Enter test email in SMTP settings');
                          }
                        }}
                        disabled={testTemplateMutation.isPending}
                        className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-blue-50 text-blue-700 border border-blue-300 hover:bg-blue-200 hover:border-blue-400 active:bg-blue-300 active:scale-[0.97] dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/50 dark:hover:bg-blue-500/40 dark:hover:border-blue-400/70 dark:active:bg-blue-500/50 transition-all duration-150"
                      >
                        <Send className="w-3 h-3" />
                        Test
                      </button>
                      <button
                        onClick={(e) => handleTemplatePreview(e, tmpl)}
                        className="btn btn-secondary !text-xs !py-1 !px-2 flex items-center gap-1"
                        title="Preview"
                      >
                        <Eye className="w-3 h-3" />
                        Preview
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openTemplateModal(tmpl); }}
                        className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyTemplateMutation.mutate(tmpl); }}
                        className="btn btn-secondary !text-xs !py-1 !px-2 flex items-center gap-1"
                        disabled={copyTemplateMutation.isPending}
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedTemplate(tmpl); setDeleteTemplateDialogOpen(true); }}
                        className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import/Export Tab */}
      {activeTab === 'import-export' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Import Section */}
          <div className="card !p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary-600" />
              Import
            </h3>

            <div className="space-y-4">
              {/* Import Type Selection */}
              <div>
                <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Data type</label>
                <select
                  value={importType}
                  onChange={(e) => { setImportType(e.target.value); setImportValidation(null); setImportData(null); }}
                  className="input !py-1.5 !text-sm w-full"
                >
                  <option value="all">Complete backup (JSON)</option>
                  <option value="clients">Clients</option>
                  <option value="domains">Domains</option>
                  <option value="hosting">Hosting</option>
                  <option value="packages">Packages</option>
                </select>
              </div>

              {/* CSV Templates */}
              {importType !== 'all' && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                  <div className="text-xs text-blue-700 dark:text-blue-300 mb-2">CSV Template</div>
                  <button
                    onClick={() => handleDownloadTemplate(importType)}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Download {importType}-template.csv
                  </button>
                  <p className="text-[10px] text-blue-500 mt-1">Fill the template with your data and import</p>
                </div>
              )}

              {/* File Upload */}
              <div>
                <button
                  onClick={() => csvInputRef.current?.click()}
                  className="btn btn-primary w-full !py-2 !text-sm flex items-center justify-center"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Select file ({importType === 'all' ? '.json' : '.csv, .json'})
                </button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept={importType === 'all' ? '.json' : '.csv,.json'}
                  onChange={handleImportFileSelect}
                  className="hidden"
                />
              </div>

              {/* Validation Results */}
              {importValidation && (
                <div className={`rounded-lg p-3 ${importValidation.valid ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                  <div className={`text-xs font-medium mb-2 ${importValidation.valid ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                    {importValidation.valid ? '✓ Validation successful' : '✗ Validation errors'}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Total rows: {importValidation.totalRows} | Valid: {importValidation.validRows}
                  </div>

                  {importValidation.errors.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto">
                      {importValidation.errors.slice(0, 10).map((err, i) => (
                        <div key={i} className="text-xs text-red-600 dark:text-red-400">
                          Row {err.row}: {err.field && `[${err.field}]`} {err.message}
                        </div>
                      ))}
                      {importValidation.errors.length > 10 && (
                        <div className="text-xs text-red-500">...and {importValidation.errors.length - 10} more errors</div>
                      )}
                    </div>
                  )}

                  {importValidation.valid && (
                    <button
                      onClick={handleImportConfirm}
                      className="mt-3 btn btn-primary w-full !py-1.5 !text-sm"
                    >
                      Confirm import
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Export Section */}
          <div className="card !p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Download className="w-4 h-4 text-primary-600" />
              Export
            </h3>

            <div className="space-y-4">
              {/* Export Type Selection */}
              <div>
                <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 block">What to export</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={exportTypes.includes('all')}
                      onChange={(e) => setExportTypes(e.target.checked ? ['all'] : [])}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-gray-700 dark:text-gray-300 font-medium">All (complete backup)</span>
                  </label>

                  {!exportTypes.includes('all') && (
                    <div className="ml-4 space-y-1.5 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                      {[
                        { id: 'clients', label: 'Clients' },
                        { id: 'domains', label: 'Domains' },
                        { id: 'hosting', label: 'Hosting' },
                        { id: 'packages', label: 'Packages' },
                        { id: 'templates', label: 'Email templates' },
                        { id: 'scheduler', label: 'Scheduler' },
                        { id: 'settings', label: 'Settings' },
                      ].map((item) => (
                        <label key={item.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={exportTypes.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setExportTypes([...exportTypes, item.id]);
                              } else {
                                setExportTypes(exportTypes.filter(t => t !== item.id));
                              }
                            }}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                          />
                          <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Export Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleExport('json')}
                  disabled={exportTypes.length === 0 || exportLoading}
                  className="btn btn-primary flex-1 !py-2 !text-sm flex items-center justify-center"
                >
                  {exportLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  {exportLoading ? 'Loading...' : 'Export JSON'}
                </button>
                {!exportTypes.includes('all') && exportTypes.length === 1 && (
                  <button
                    onClick={() => handleExport('csv')}
                    className="btn btn-secondary flex-1 !py-2 !text-sm flex items-center justify-center"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </button>
                )}
              </div>

              {exportTypes.includes('all') && (
                <p className="text-[10px] text-gray-400">
                  Complete backup includes all data and can be used for restore.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && isAdmin && (
        <div className="space-y-4">
          <div className="card !p-0 overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="input !py-1.5 !text-sm w-full pl-8"
                />
              </div>
              <button
                onClick={() => { setSelectedUser(null); setUserModalOpen(true); }}
                className="btn btn-primary btn-sm flex items-center"
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </button>
            </div>
            {usersLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary-600" /></div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                {searchTerm ? 'No results' : 'No users'}
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => { setSelectedUser(user); setUserModalOpen(true); }}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors ${
                      user.isActive === false ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0 text-sm">
                      <UserIcon className={`w-4 h-4 flex-shrink-0 ${user.isActive === false ? 'text-gray-400' : 'text-primary-600'}`} />
                      <span className="font-medium">{user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user.name}</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-gray-600 dark:text-gray-400">{user.email}</span>
                      {user.phone && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-gray-500 dark:text-gray-500 text-xs">{user.phone}</span>
                        </>
                      )}
                      <span className="text-gray-400">|</span>
                      <span className={`px-1.5 py-0.5 text-xs rounded ${
                        user.role === 'superadmin'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                          : user.role === 'admin'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
                          : user.role === 'salesadmin'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                      }`}>
                        {user.role === 'superadmin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : user.role === 'salesadmin' ? 'Sales Admin' : 'Sales'}
                      </span>
                      {user.isActive === false && (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                          Inactive
                        </span>
                      )}
                      {user.mustChangePassword && (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
                          Must change password
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleUserActiveMutation.mutate(user.id); }}
                        disabled={toggleUserActiveMutation.isPending}
                        className={`!text-xs !py-1 !px-2 rounded border transition-all duration-150 ${
                          user.isActive === false
                            ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/50'
                            : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-200 dark:bg-gray-500/20 dark:text-gray-300 dark:border-gray-500/50'
                        }`}
                      >
                        {user.isActive === false ? 'Aktiviraj' : 'Deaktiviraj'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setUserModalOpen(true); }}
                        className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"
                      >
                        <Pencil className="w-3 h-3" />Uredi
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setDeleteUserDialogOpen(true); }}
                        className="!text-xs !py-1 !px-2 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Modal */}
      <Modal
        isOpen={userModalOpen}
        onClose={() => { setUserModalOpen(false); setSelectedUser(null); }}
        title={selectedUser ? 'Edit user' : 'New user'}
      >
        <form onSubmit={handleUserSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">First Name *</label>
              <input name="firstName" defaultValue={selectedUser?.firstName || ''} className="input !py-1.5 !text-sm" required />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Last Name *</label>
              <input name="lastName" defaultValue={selectedUser?.lastName || ''} className="input !py-1.5 !text-sm" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Email *</label>
              <input name="email" type="email" defaultValue={selectedUser?.email} className="input !py-1.5 !text-sm" required />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Phone</label>
              <input name="phone" type="tel" defaultValue={selectedUser?.phone || ''} className="input !py-1.5 !text-sm" placeholder="+381..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Role *</label>
              <select name="role" defaultValue={selectedUser?.role || 'sales'} className="input !py-1.5 !text-sm" required>
                <option value="sales">Sales</option>
                <option value="salesadmin">Sales Admin</option>
                <option value="admin">Administrator</option>
                <option value="superadmin">Super Administrator</option>
              </select>
            </div>
            {selectedUser ? (
              <div className="flex items-center gap-4 pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={selectedUser?.isActive !== false}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-gray-700 dark:text-gray-300">Active</span>
                </label>
                <button
                  type="button"
                  onClick={() => resendInviteMutation.mutate(selectedUser.id)}
                  disabled={resendInviteMutation.isPending}
                  className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  <Send className="w-3 h-3" />
                  {resendInviteMutation.isPending ? 'Sending...' : 'Send invitation'}
                </button>
              </div>
            ) : (
              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    name="sendInvite"
                    id="sendInvite"
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-gray-700 dark:text-gray-300">Send invitation by email</span>
                </label>
              </div>
            )}
          </div>
          {!selectedUser && (
            <div id="passwordFieldsContainer">
              <label className="text-[11px] text-gray-500 dark:text-gray-400">
                Password <span id="passwordRequired">*</span>
              </label>
              <input
                name="password"
                type="password"
                className="input !py-1.5 !text-sm"
                id="passwordField"
                placeholder="If you send an invitation, the password will be generated automatically"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                If you check &quot;Send invitation&quot;, a temporary password will be generated and sent to the user.
              </p>
            </div>
          )}
          {selectedUser && (
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">New password</label>
              <input
                name="password"
                type="password"
                className="input !py-1.5 !text-sm"
                placeholder="Leave blank to keep current"
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setUserModalOpen(false)} className="btn btn-secondary !py-1.5 !px-3 !text-sm">
              Odustani
            </button>
            <button type="submit" className="btn btn-primary !py-1.5 !px-4 !text-sm" disabled={saveUserMutation.isPending}>
              {saveUserMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Mail Server Modal */}
      <Modal
        isOpen={mailServerModalOpen}
        onClose={() => { setMailServerModalOpen(false); setSelectedMailServer(null); }}
        title={selectedMailServer ? 'Edit Mail Server' : 'Add Mail Server'}
      >
        <form onSubmit={handleMailServerSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Name *</label>
              <input name="name" defaultValue={selectedMailServer?.name} className="input !py-1.5 !text-sm" required placeholder="e.g. Mail Server 1" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Hostname *</label>
              <input name="hostname" defaultValue={selectedMailServer?.hostname} className="input !py-1.5 !text-sm" required placeholder="mail.example.com" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400">Description</label>
            <input name="description" defaultValue={selectedMailServer?.description || ''} className="input !py-1.5 !text-sm" placeholder="Optional description" />
          </div>
          <div className="flex items-center">
            <input name="isDefault" type="checkbox" defaultChecked={selectedMailServer?.isDefault || false} className="mr-2" />
            <label className="text-sm text-gray-700 dark:text-gray-300">Set as default</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setMailServerModalOpen(false)} className="btn btn-secondary !py-1.5 !px-3 !text-sm">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary !py-1.5 !px-4 !text-sm" disabled={saveMailServerMutation.isPending}>
              {saveMailServerMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Mail Security Modal */}
      <Modal
        isOpen={mailSecurityModalOpen}
        onClose={() => { setMailSecurityModalOpen(false); setSelectedMailSecurity(null); }}
        title={selectedMailSecurity ? 'Edit Mail Security' : 'Add Mail Security'}
      >
        <form onSubmit={handleMailSecuritySubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Name *</label>
              <input name="name" defaultValue={selectedMailSecurity?.name} className="input !py-1.5 !text-sm" required placeholder="e.g. SpamExperts" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Hostname *</label>
              <input name="hostname" defaultValue={selectedMailSecurity?.hostname} className="input !py-1.5 !text-sm" required placeholder="security.example.com" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400">Description</label>
            <input name="description" defaultValue={selectedMailSecurity?.description || ''} className="input !py-1.5 !text-sm" placeholder="Optional description" />
          </div>
          <div className="flex items-center">
            <input name="isDefault" type="checkbox" defaultChecked={selectedMailSecurity?.isDefault || false} className="mr-2" />
            <label className="text-sm text-gray-700 dark:text-gray-300">Set as default</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setMailSecurityModalOpen(false)} className="btn btn-secondary !py-1.5 !px-3 !text-sm">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary !py-1.5 !px-4 !text-sm" disabled={saveMailSecurityMutation.isPending}>
              {saveMailSecurityMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bank Account Modal */}
      <Modal
        isOpen={bankAccountModalOpen}
        onClose={() => { setBankAccountModalOpen(false); setSelectedBankAccount(null); }}
        title={selectedBankAccount ? 'Edit Bank Account' : 'Add Bank Account'}
      >
        <form onSubmit={handleBankAccountSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Bank Name *</label>
              <input name="bankName" defaultValue={selectedBankAccount?.bankName} className="input !py-1.5 !text-sm" required placeholder="e.g. Banca Intesa" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Account Number *</label>
              <input name="accountNumber" defaultValue={selectedBankAccount?.accountNumber} className="input !py-1.5 !text-sm" required placeholder="160-0000000000000-00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">SWIFT</label>
              <input name="swift" defaultValue={selectedBankAccount?.swift || ''} className="input !py-1.5 !text-sm" placeholder="DBDBRSBG" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">IBAN</label>
              <input name="iban" defaultValue={selectedBankAccount?.iban || ''} className="input !py-1.5 !text-sm" placeholder="RS35..." />
            </div>
          </div>
          <div className="flex items-center">
            <input name="isDefault" type="checkbox" defaultChecked={selectedBankAccount?.isDefault || false} className="mr-2" />
            <label className="text-sm text-gray-700 dark:text-gray-300">Set as default</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setBankAccountModalOpen(false)} className="btn btn-secondary !py-1.5 !px-3 !text-sm">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary !py-1.5 !px-4 !text-sm" disabled={saveBankAccountMutation.isPending}>
              {saveBankAccountMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Notification Settings Modal */}
      <Modal
        isOpen={notificationModalOpen}
        onClose={() => { setNotificationModalOpen(false); resetNotificationForm(); }}
        title={selectedNotification ? 'Edit Notification' : 'Add Notification'}
        size="lg"
      >
        <div className="space-y-4">
          {/* Name and Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">Name *</label>
              <input
                type="text"
                value={notificationForm.name}
                onChange={(e) => setNotificationForm({ ...notificationForm, name: e.target.value })}
                className="input !py-1.5 !text-sm"
                placeholder="e.g. Hosting Expiry Reminder"
                required
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">Type *</label>
              <select
                value={notificationForm.type}
                onChange={(e) => setNotificationForm({ ...notificationForm, type: e.target.value as typeof notificationForm.type, templateId: null })}
                className="input !py-1.5 !text-sm"
              >
                <option value="client">Client</option>
                <option value="service_request">Service Request</option>
                <option value="sales_request">Sales Request</option>
                <option value="reports">Reports</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>

          {/* Template Selection - filtered by type */}
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">Email Template</label>
            <select
              value={notificationForm.templateId || ''}
              onChange={(e) => setNotificationForm({ ...notificationForm, templateId: e.target.value ? parseInt(e.target.value) : null })}
              className="input !py-1.5 !text-sm"
            >
              <option value="">-- Select template --</option>
              {filteredTemplatesForNotification.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
              ))}
            </select>
            {filteredTemplatesForNotification.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">No templates for this type. Create one in Templates tab.</p>
            )}
          </div>

          {/* Schedule - different UI for reports/system vs expiry-based types */}
          {(notificationForm.type === 'reports' || notificationForm.type === 'system') ? (
            <div className="space-y-3">
              <label className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">Frequency</label>

              {/* Frequency pills */}
              <div className="flex gap-2">
                {(['daily', 'weekly', 'monthly'] as const).map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setNotificationForm({ ...notificationForm, frequency: freq })}
                    className={`px-4 py-1.5 rounded border text-sm font-medium transition-colors ${
                      notificationForm.frequency === freq
                        ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:border-primary-500 dark:text-primary-300'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {freq === 'daily' ? 'Daily' : freq === 'weekly' ? 'Weekly' : 'Monthly'}
                  </button>
                ))}
              </div>

              {/* Day of week for weekly */}
              {notificationForm.frequency === 'weekly' && (
                <div className="space-y-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Day of week:</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 1, label: 'Mon' },
                      { value: 2, label: 'Tue' },
                      { value: 3, label: 'Wed' },
                      { value: 4, label: 'Thu' },
                      { value: 5, label: 'Fri' },
                      { value: 6, label: 'Sat' },
                      { value: 0, label: 'Sun' },
                    ].map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => setNotificationForm({ ...notificationForm, dayOfWeek: day.value })}
                        className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
                          notificationForm.dayOfWeek === day.value
                            ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:border-primary-500 dark:text-primary-300'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Day of month for monthly */}
              {notificationForm.frequency === 'monthly' && (
                <div className="space-y-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Day of month:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setNotificationForm({ ...notificationForm, dayOfMonth: day })}
                        className={`w-8 h-8 rounded border text-xs font-medium transition-colors ${
                          notificationForm.dayOfMonth === day
                            ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:border-primary-500 dark:text-primary-300'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">If the selected day doesn't exist in a month, the last day of that month will be used.</p>
                </div>
              )}

              {/* Run time */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Run at:</span>
                <input
                  type="time"
                  value={notificationForm.runAtTime}
                  onChange={(e) => setNotificationForm({ ...notificationForm, runAtTime: e.target.value })}
                  className="input !py-1 !px-2 !text-sm w-28"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">Schedule (days)</label>

              {/* Before expiry */}
              <div className="space-y-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Before expiry:</span>
                <div className="flex flex-wrap gap-2">
                  {[60, 30, 21, 14, 7, 1].map((day) => (
                    <label
                      key={day}
                      className={`px-3 py-1.5 rounded border cursor-pointer text-sm font-medium transition-colors ${
                        notificationForm.schedule.includes(day)
                          ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:border-primary-500 dark:text-primary-300'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={notificationForm.schedule.includes(day)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNotificationForm({ ...notificationForm, schedule: [...notificationForm.schedule, day].sort((a, b) => b - a) });
                          } else {
                            setNotificationForm({ ...notificationForm, schedule: notificationForm.schedule.filter(d => d !== day) });
                          }
                        }}
                        className="sr-only"
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>

              {/* Expiry date */}
              <div className="space-y-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Expiry date:</span>
                <div className="flex flex-wrap gap-2">
                  <label
                    className={`px-3 py-1.5 rounded border cursor-pointer text-sm font-medium transition-colors ${
                      notificationForm.schedule.includes(0)
                        ? 'bg-orange-100 border-orange-500 text-orange-700 dark:bg-orange-900 dark:border-orange-500 dark:text-orange-300'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={notificationForm.schedule.includes(0)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNotificationForm({ ...notificationForm, schedule: [...notificationForm.schedule, 0].sort((a, b) => b - a) });
                        } else {
                          setNotificationForm({ ...notificationForm, schedule: notificationForm.schedule.filter(d => d !== 0) });
                        }
                      }}
                      className="sr-only"
                    />
                    0 (day of expiry)
                  </label>
                </div>
              </div>

              {/* After expiry */}
              <div className="space-y-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">After expiry:</span>
                <div className="flex flex-wrap gap-2">
                  {[7, 30, 60].map((day) => (
                    <label
                      key={-day}
                      className={`px-3 py-1.5 rounded border cursor-pointer text-sm font-medium transition-colors ${
                        notificationForm.schedule.includes(-day)
                          ? 'bg-red-100 border-red-500 text-red-700 dark:bg-red-900 dark:border-red-500 dark:text-red-300'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={notificationForm.schedule.includes(-day)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNotificationForm({ ...notificationForm, schedule: [...notificationForm.schedule, -day].sort((a, b) => b - a) });
                          } else {
                            setNotificationForm({ ...notificationForm, schedule: notificationForm.schedule.filter(d => d !== -day) });
                          }
                        }}
                        className="sr-only"
                      />
                      +{day}
                    </label>
                  ))}
                </div>
              </div>

              {/* Run time */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Run at:</span>
                <input
                  type="time"
                  value={notificationForm.runAtTime}
                  onChange={(e) => setNotificationForm({ ...notificationForm, runAtTime: e.target.value })}
                  className="input !py-1 !px-2 !text-sm w-28"
                />
              </div>
            </div>
          )}

          {/* Recipients */}
          <div className="border-t pt-4 dark:border-gray-700">
            <label className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">Recipients</label>
            <div className="mt-2 space-y-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recipientType"
                    checked={notificationForm.recipientType === 'primary'}
                    onChange={() => setNotificationForm({ ...notificationForm, recipientType: 'primary' })}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="text-sm">Primary Contact (from client)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recipientType"
                    checked={notificationForm.recipientType === 'custom'}
                    onChange={() => setNotificationForm({ ...notificationForm, recipientType: 'custom' })}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="text-sm">Custom Email</span>
                </label>
              </div>

              {notificationForm.recipientType === 'custom' && (
                <div>
                  <label className="text-[11px] text-gray-500 dark:text-gray-400">Custom Email Address</label>
                  <input
                    type="email"
                    value={notificationForm.customEmail}
                    onChange={(e) => setNotificationForm({ ...notificationForm, customEmail: e.target.value })}
                    className="input !py-1.5 !text-sm"
                    placeholder="email@example.com"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationForm.includeTechnical}
                  onChange={(e) => setNotificationForm({ ...notificationForm, includeTechnical: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600"
                />
                <span className="text-sm">Also send to Technical Contact (from domain)</span>
              </label>
            </div>
          </div>

          {/* Enabled Toggle */}
          <div className="flex items-center justify-between py-2 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">Enable this notification</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationForm.enabled}
                onChange={(e) => setNotificationForm({ ...notificationForm, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex justify-between pt-2">
            <div className="flex gap-2">
              {selectedNotification && (
                <button
                  type="button"
                  onClick={() => {
                    copyNotificationMutation.mutate(selectedNotification);
                    setNotificationModalOpen(false);
                  }}
                  className="btn btn-secondary !py-1.5 !px-3 !text-sm flex items-center gap-1"
                  disabled={copyNotificationMutation.isPending}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Make a Copy
                </button>
              )}
              {selectedNotification && (
                <button
                  type="button"
                  onClick={() => triggerNotificationMutation.mutate(selectedNotification.id)}
                  className="!py-1.5 !px-3 !text-sm flex items-center gap-1 rounded bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-200 hover:border-amber-400 active:bg-amber-300 active:scale-[0.97] dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/50 dark:hover:bg-amber-500/40 dark:hover:border-amber-400/70 dark:active:bg-amber-500/50 transition-all duration-150"
                  disabled={triggerNotificationMutation.isPending}
                >
                  <Play className="w-3.5 h-3.5" />
                  {triggerNotificationMutation.isPending ? 'Sending...' : 'Trigger Now'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setNotificationModalOpen(false); resetNotificationForm(); }}
                className="btn btn-secondary !py-1.5 !px-3 !text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNotificationSubmit}
                className="btn btn-primary !py-1.5 !px-4 !text-sm"
                disabled={updateNotificationMutation.isPending || createNotificationMutation.isPending || !notificationForm.name}
              >
                {(updateNotificationMutation.isPending || createNotificationMutation.isPending) ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Template Modal - Visual Editor */}
      <Modal
        isOpen={templateModalOpen}
        onClose={() => { setTemplateModalOpen(false); setSelectedTemplate(null); }}
        title={selectedTemplate ? 'Edit Template' : 'Add Template'}
        size="xl"
      >
        <form onSubmit={handleVisualTemplateSubmit} className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Name *</label>
              <input
                value={templateForm.name}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                className="input !py-1.5 !text-sm"
                placeholder="e.g. Domain Expiry Reminder"
                required
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Type *</label>
              <select
                value={templateForm.type}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, type: e.target.value }))}
                className="input !py-1.5 !text-sm"
                required
              >
                {Object.entries(templateTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject with variable buttons */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Subject *</label>
              <div className="flex gap-1">
                {templateVariables.slice(0, 3).map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key, 'subject')}
                    className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                    title={v.description}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              ref={templateSubjectRef}
              value={templateForm.subject}
              onChange={(e) => setTemplateForm(prev => ({ ...prev, subject: e.target.value }))}
              className="input !py-1.5 !text-sm"
              placeholder="e.g. Notification: Domain {{domainName}} expires in {{daysUntilExpiry}} days"
              required
            />
          </div>

          {/* Email Header Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Email Header</span>
              <label className="flex items-center text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={templateForm.showHeader}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, showHeader: e.target.checked }))}
                  className="mr-1.5"
                />
                Show header
              </label>
            </div>

            {templateForm.showHeader && (
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {/* Logo */}
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Logo</label>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                        <input
                          type="radio"
                          name="logoSource"
                          checked={templateForm.useCompanyLogo}
                          onChange={() => setTemplateForm(prev => ({ ...prev, useCompanyLogo: true, headerLogo: '' }))}
                          className="mr-1.5"
                        />
                        Company
                      </label>
                      <label className="flex items-center text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                        <input
                          type="radio"
                          name="logoSource"
                          checked={!templateForm.useCompanyLogo}
                          onChange={() => setTemplateForm(prev => ({ ...prev, useCompanyLogo: false }))}
                          className="mr-1.5"
                        />
                        Custom
                      </label>
                    </div>
                    {!templateForm.useCompanyLogo && (
                      <div className="mt-2 flex items-center gap-2">
                        {templateForm.headerLogo ? (
                          <div className="relative group">
                            <img src={templateForm.headerLogo} alt="Logo" className="h-10 max-w-[100px] object-contain bg-gray-100 dark:bg-gray-800 rounded p-1" />
                            <button
                              type="button"
                              onClick={() => setTemplateForm(prev => ({ ...prev, headerLogo: '' }))}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => logoUploadRef.current?.click()}
                            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          >
                            Upload logo
                          </button>
                        )}
                        <input
                          ref={logoUploadRef}
                          type="file"
                          accept="image/*"
                          onChange={handleTemplateLogoUpload}
                          className="hidden"
                        />
                      </div>
                    )}
                  </div>

                  {/* Logo Position */}
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Logo Position</label>
                    <div className="flex items-center gap-1">
                      {(['left', 'center', 'right'] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setTemplateForm(prev => ({ ...prev, headerLogoPosition: pos }))}
                          className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                            templateForm.headerLogoPosition === pos
                              ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:border-primary-500 dark:text-primary-300'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                          }`}
                        >
                          {pos === 'left' ? 'Left' : pos === 'center' ? 'Center' : 'Right'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Background Color */}
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Background Color</label>
                    <ColorPicker
                      value={templateForm.headerBgTransparent ? 'rgba(0,0,0,0)' : templateForm.headerBgColor}
                      onChange={(color) => {
                        if (color === 'rgba(0,0,0,0)' || color.includes('rgba') && color.endsWith(',0)')) {
                          setTemplateForm(prev => ({ ...prev, headerBgTransparent: true }));
                        } else {
                          setTemplateForm(prev => ({ ...prev, headerBgColor: color, headerBgTransparent: false }));
                        }
                      }}
                      showOpacity={true}
                    />
                  </div>
                </div>

                {/* Header Image (Banner) */}
                <div>
                  <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Header Image (optional banner)</label>
                  <div className="flex items-center gap-2">
                    {templateForm.headerImage ? (
                      <div className="relative group">
                        <img src={templateForm.headerImage} alt="Header" className="h-16 max-w-[200px] object-contain bg-gray-100 dark:bg-gray-800 rounded p-1" />
                        <button
                          type="button"
                          onClick={() => setTemplateForm(prev => ({ ...prev, headerImage: '' }))}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => headerImageUploadRef.current?.click()}
                        className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                      >
                        Upload image
                      </button>
                    )}
                    <input
                      ref={headerImageUploadRef}
                      type="file"
                      accept="image/*"
                      onChange={handleHeaderImageUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Email Content Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Email Content</span>
            </div>

            <div className="p-3 space-y-3">
              {/* Title/Subject */}
              <div>
                <label className="text-[11px] text-gray-500 dark:text-gray-400">Title (optional heading in email)</label>
                <input
                  value={templateForm.title}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, title: e.target.value }))}
                  className="input !py-1.5 !text-sm"
                  placeholder="e.g. Domain expiry notification"
                />
              </div>

              {/* Body with variable buttons */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-gray-500 dark:text-gray-400">Message Body *</label>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {templateVariables.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertVariable(v.key, 'body')}
                        className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                        title={v.description}
                      >
                        + {v.label}
                      </button>
                    ))}
                    {templateForm.type === 'reports' && (
                      <button
                        type="button"
                        onClick={() => insertVariable(reportVariable.key, 'body')}
                        className="px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-800"
                        title={reportVariable.description}
                      >
                        + {reportVariable.label}
                      </button>
                    )}
                    {templateForm.type === 'system' && (
                      <button
                        type="button"
                        onClick={() => insertVariable(systemVariable.key, 'body')}
                        className="px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800"
                        title={systemVariable.description}
                      >
                        + {systemVariable.label}
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  ref={templateBodyRef}
                  value={templateForm.body}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, body: e.target.value }))}
                  className="input !py-1.5 !text-sm"
                  rows={6}
                  placeholder="We notify you that domain {{domainName}} expires on {{expiryDate}}.

Please renew on time to avoid service interruption.

Za sva pitanja stojimo Vam na raspolaganju."
                  required
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Tip: Click the buttons above to insert variables. Variables will be replaced with actual data when sending.
                </p>
              </div>

            </div>
          </div>

          {/* Report Configuration Section - only for 'reports' type */}
          {templateForm.type === 'reports' && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Report Configuration</span>
              </div>
              <div className="p-3 space-y-4">
                {/* Status Filters */}
                <div>
                  <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 block">Include Statuses:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { status: 'green' as DomainStatus, label: 'Green (>31 days)', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
                      { status: 'yellow' as DomainStatus, label: 'Yellow (8-31 days)', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
                      { status: 'orange' as DomainStatus, label: 'Orange (1-7 days)', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
                      { status: 'red' as DomainStatus, label: 'Red (Expired 0-30 days)', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
                      { status: 'forDeletion' as DomainStatus, label: 'For Deletion (30-60 days)', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
                      { status: 'deleted' as DomainStatus, label: 'Deleted (60+ days)', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
                    ]).map(({ status, label, color }) => (
                      <label key={status} className={`flex items-center text-xs cursor-pointer p-2 rounded ${color}`}>
                        <input
                          type="checkbox"
                          checked={templateForm.reportConfig.filters.statuses.includes(status)}
                          onChange={(e) => {
                            const statuses = e.target.checked
                              ? [...templateForm.reportConfig.filters.statuses, status]
                              : templateForm.reportConfig.filters.statuses.filter(s => s !== status);
                            setTemplateForm(prev => ({
                              ...prev,
                              reportConfig: {
                                ...prev.reportConfig,
                                filters: { ...prev.reportConfig.filters, statuses }
                              }
                            }));
                          }}
                          className="mr-2"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Sorting */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Sort by:</label>
                    <select
                      value={templateForm.reportConfig.sorting.field}
                      onChange={(e) => setTemplateForm(prev => ({
                        ...prev,
                        reportConfig: {
                          ...prev.reportConfig,
                          sorting: { ...prev.reportConfig.sorting, field: e.target.value as ReportConfig['sorting']['field'] }
                        }
                      }))}
                      className="input !py-1.5 !text-sm"
                    >
                      <option value="domainName">Domain Name</option>
                      <option value="clientName">Client Name</option>
                      <option value="expiryDate">Expiry Date</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Direction:</label>
                    <select
                      value={templateForm.reportConfig.sorting.direction}
                      onChange={(e) => setTemplateForm(prev => ({
                        ...prev,
                        reportConfig: {
                          ...prev.reportConfig,
                          sorting: { ...prev.reportConfig.sorting, direction: e.target.value as 'asc' | 'desc' }
                        }
                      }))}
                      className="input !py-1.5 !text-sm"
                    >
                      <option value="asc">A-Z / Earliest first</option>
                      <option value="desc">Z-A / Latest first</option>
                    </select>
                  </div>
                </div>

                {/* Group by status */}
                <label className="flex items-center text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={templateForm.reportConfig.groupByStatus}
                    onChange={(e) => setTemplateForm(prev => ({
                      ...prev,
                      reportConfig: { ...prev.reportConfig, groupByStatus: e.target.checked }
                    }))}
                    className="mr-2"
                  />
                  Group by status
                </label>

                <p className="text-[10px] text-gray-400">
                  Tip: Add {'{{hostingList}}'} to Message Body to include the generated hosting list table.
                </p>
              </div>
            </div>
          )}

          {/* System Configuration Section - only for 'system' type */}
          {templateForm.type === 'system' && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">System Configuration</span>
              </div>
              <div className="p-3 space-y-4">
                {/* Section Toggles */}
                <div>
                  <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 block">Include Sections:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: 'blockedIps' as const, label: '🛡️ Blocked IPs', color: 'bg-red-50 dark:bg-red-900/30' },
                      { key: 'lockedUsers' as const, label: '🔒 Locked Users', color: 'bg-amber-50 dark:bg-amber-900/30' },
                      { key: 'failedLogins' as const, label: '⚠️ Failed Logins', color: 'bg-purple-50 dark:bg-purple-900/30' },
                      { key: 'passwordChanges' as const, label: '🔑 Password Changes', color: 'bg-green-50 dark:bg-green-900/30' },
                      { key: 'resourceUsage' as const, label: '💾 Resource Usage', color: 'bg-cyan-50 dark:bg-cyan-900/30' },
                      { key: 'databaseSize' as const, label: '🗄️ Database Info', color: 'bg-indigo-50 dark:bg-indigo-900/30' },
                    ]).map(({ key, label, color }) => (
                      <label key={key} className={`flex items-center text-xs cursor-pointer p-2 rounded ${color}`}>
                        <input
                          type="checkbox"
                          checked={templateForm.systemConfig.sections[key]}
                          onChange={(e) => {
                            setTemplateForm(prev => ({
                              ...prev,
                              systemConfig: {
                                ...prev.systemConfig,
                                sections: { ...prev.systemConfig.sections, [key]: e.target.checked }
                              }
                            }));
                          }}
                          className="mr-2"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Period Selection */}
                <div>
                  <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Data Period:</label>
                  <select
                    value={templateForm.systemConfig.period}
                    onChange={(e) => setTemplateForm(prev => ({
                      ...prev,
                      systemConfig: {
                        ...prev.systemConfig,
                        period: e.target.value as SystemConfig['period']
                      }
                    }))}
                    className="input !py-1.5 !text-sm"
                  >
                    <option value="today">Today</option>
                    <option value="last7days">Last 7 days</option>
                    <option value="last30days">Last 30 days</option>
                    <option value="all">All time</option>
                  </select>
                </div>

                <p className="text-[10px] text-gray-400">
                  Tip: Add {'{{systemInfo}}'} to Message Body to include system information.
                </p>
              </div>
            </div>
          )}

          {/* Email Signature Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Email Signature</span>
              <label className="flex items-center text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={templateForm.showSignature}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, showSignature: e.target.checked }))}
                  className="mr-1.5"
                />
                Show signature
              </label>
            </div>

            {templateForm.showSignature && (
              <div className="p-3 space-y-3">
                {/* Signature Text */}
                <div>
                  <label className="text-[11px] text-gray-500 dark:text-gray-400">Signature Text</label>
                  <textarea
                    value={templateForm.signature}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, signature: e.target.value }))}
                    className="input !py-1.5 !text-sm"
                    rows={2}
                    placeholder="Best regards,
Your team"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Signature Logo */}
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Logo (optional)</label>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                        <input
                          type="radio"
                          name="signatureLogoSource"
                          checked={templateForm.useCompanyLogoInSignature}
                          onChange={() => setTemplateForm(prev => ({ ...prev, useCompanyLogoInSignature: true, signatureLogo: '' }))}
                          className="mr-1.5"
                        />
                        Company
                      </label>
                      <label className="flex items-center text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                        <input
                          type="radio"
                          name="signatureLogoSource"
                          checked={!templateForm.useCompanyLogoInSignature && !templateForm.signatureLogo}
                          onChange={() => setTemplateForm(prev => ({ ...prev, useCompanyLogoInSignature: false, signatureLogo: '' }))}
                          className="mr-1.5"
                        />
                        None
                      </label>
                      <label className="flex items-center text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                        <input
                          type="radio"
                          name="signatureLogoSource"
                          checked={!templateForm.useCompanyLogoInSignature && !!templateForm.signatureLogo}
                          onChange={() => setTemplateForm(prev => ({ ...prev, useCompanyLogoInSignature: false }))}
                          className="mr-1.5"
                        />
                        Custom
                      </label>
                    </div>
                    {!templateForm.useCompanyLogoInSignature && (
                      <div className="mt-2 flex items-center gap-2">
                        {templateForm.signatureLogo ? (
                          <div className="relative group">
                            <img src={templateForm.signatureLogo} alt="Logo" className="h-8 max-w-[80px] object-contain bg-gray-100 dark:bg-gray-800 rounded p-1" />
                            <button
                              type="button"
                              onClick={() => setTemplateForm(prev => ({ ...prev, signatureLogo: '' }))}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => signatureLogoUploadRef.current?.click()}
                            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          >
                            Upload
                          </button>
                        )}
                        <input
                          ref={signatureLogoUploadRef}
                          type="file"
                          accept="image/*"
                          onChange={handleSignatureLogoUpload}
                          className="hidden"
                        />
                      </div>
                    )}
                  </div>

                  {/* Signature Image */}
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Image (optional)</label>
                    <div className="flex items-center gap-2">
                      {templateForm.signatureImage ? (
                        <div className="relative group">
                          <img src={templateForm.signatureImage} alt="Signature" className="h-10 max-w-[100px] object-contain bg-gray-100 dark:bg-gray-800 rounded p-1" />
                          <button
                            type="button"
                            onClick={() => setTemplateForm(prev => ({ ...prev, signatureImage: '' }))}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => signatureImageUploadRef.current?.click()}
                          className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          Upload
                        </button>
                      )}
                      <input
                        ref={signatureImageUploadRef}
                        type="file"
                        accept="image/*"
                        onChange={handleSignatureImageUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Email Footer Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Email Footer</span>
              <label className="flex items-center text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={templateForm.showFooter}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, showFooter: e.target.checked }))}
                  className="mr-1.5"
                />
                Show footer
              </label>
            </div>

            {templateForm.showFooter && (
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* Footer Image */}
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Footer Image</label>
                    <div className="flex items-center gap-2">
                      {templateForm.footerImage ? (
                        <div className="relative group">
                          <img src={templateForm.footerImage} alt="Footer" className="h-12 max-w-[150px] object-contain bg-gray-100 dark:bg-gray-800 rounded p-1" />
                          <button
                            type="button"
                            onClick={() => setTemplateForm(prev => ({ ...prev, footerImage: '' }))}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => footerImageUploadRef.current?.click()}
                          className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          Upload image
                        </button>
                      )}
                      <input
                        ref={footerImageUploadRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFooterImageUpload}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Footer Background Color */}
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Background Color</label>
                    <ColorPicker
                      value={templateForm.footerBgTransparent ? 'rgba(0,0,0,0)' : templateForm.footerBgColor}
                      onChange={(color) => {
                        if (color === 'rgba(0,0,0,0)' || color.includes('rgba') && color.endsWith(',0)')) {
                          setTemplateForm(prev => ({ ...prev, footerBgTransparent: true }));
                        } else {
                          setTemplateForm(prev => ({ ...prev, footerBgColor: color, footerBgTransparent: false }));
                        }
                      }}
                      showOpacity={true}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Preview</span>
            </div>
            <div className="bg-gray-100 dark:bg-gray-950 p-4">
              <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm">
                {/* Header Preview */}
                {templateForm.showHeader && (
                  <div
                    className="p-4"
                    style={{ backgroundColor: templateForm.headerBgTransparent ? 'transparent' : templateForm.headerBgColor }}
                  >
                    {(templateForm.useCompanyLogo || templateForm.headerLogo) && (
                      <div style={{ textAlign: templateForm.headerLogoPosition }}>
                        {templateForm.useCompanyLogo ? (
                          <span className="inline-block bg-white/20 rounded px-3 py-1 text-white text-xs">
                            [Company Logo]
                          </span>
                        ) : templateForm.headerLogo ? (
                          <img src={templateForm.headerLogo} alt="Logo" className="max-h-10 max-w-[150px] object-contain inline-block" />
                        ) : null}
                      </div>
                    )}
                    {templateForm.headerImage && (
                      <img src={templateForm.headerImage} alt="Header" className="max-w-full mt-2 mx-auto block" />
                    )}
                  </div>
                )}
                {/* Content Preview */}
                <div className="p-4 text-sm text-gray-700 dark:text-gray-300 space-y-2">
                  {templateForm.title && (
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{templateForm.title}</h3>
                  )}
                  <div className="whitespace-pre-wrap text-xs">{templateForm.body || '(Message body...)'}</div>
                  {templateForm.showSignature && (
                    <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                      <div className="whitespace-pre-wrap text-xs">
                        {templateForm.signature || 'Best regards,\nYour team'}
                      </div>
                      {(templateForm.useCompanyLogoInSignature || templateForm.signatureLogo) && (
                        <div className="mt-2">
                          {templateForm.useCompanyLogoInSignature ? (
                            <div className="bg-gray-200 dark:bg-gray-700 rounded px-2 py-1 text-[10px] text-gray-500 inline-block">
                              [Company Logo]
                            </div>
                          ) : templateForm.signatureLogo ? (
                            <img src={templateForm.signatureLogo} alt="Logo" className="max-h-6 max-w-[80px] object-contain" />
                          ) : null}
                        </div>
                      )}
                      {templateForm.signatureImage && (
                        <img src={templateForm.signatureImage} alt="" className="max-w-[100px] mt-1" />
                      )}
                    </div>
                  )}
                </div>
                {/* Footer Preview */}
                {templateForm.showFooter && (
                  <div
                    className="p-4 text-center"
                    style={{ backgroundColor: templateForm.footerBgTransparent ? 'transparent' : templateForm.footerBgColor }}
                  >
                    {templateForm.footerImage ? (
                      <img src={templateForm.footerImage} alt="Footer" className="max-h-16 max-w-full object-contain mx-auto" />
                    ) : (
                      <span className="text-white/50 text-xs">[Footer Image]</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <div>
              {selectedTemplate && (
                <button
                  type="button"
                  onClick={() => {
                    copyTemplateMutation.mutate(selectedTemplate);
                    setTemplateModalOpen(false);
                  }}
                  className="btn btn-secondary !py-1.5 !px-3 !text-sm flex items-center gap-1"
                  disabled={copyTemplateMutation.isPending}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Make a Copy
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setTemplateModalOpen(false)} className="btn btn-secondary !py-1.5 !px-3 !text-sm">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary !py-1.5 !px-4 !text-sm" disabled={saveTemplateMutation.isPending}>
                {saveTemplateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Template Preview Modal */}
      <Modal
        isOpen={templatePreviewModalOpen}
        onClose={() => setTemplatePreviewModalOpen(false)}
        title={`Preview: ${selectedTemplate?.name || 'Template'}`}
        size="full"
      >
        <div className="space-y-4">
          {/* Template Info */}
          {selectedTemplate && (
            <div className="flex items-center gap-4 text-sm bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <div>
                <span className="text-gray-500">Type:</span>
                <span className="ml-1 font-medium">{templateTypeLabels[selectedTemplate.type] || selectedTemplate.type}</span>
              </div>
              <div className="text-gray-300 dark:text-gray-600">|</div>
              <div>
                <span className="text-gray-500">Subject:</span>
                <span className="ml-1 font-medium">{selectedTemplate.subject}</span>
              </div>
              <div className="text-gray-300 dark:text-gray-600">|</div>
              <div>
                <span className={`px-2 py-0.5 text-xs rounded ${selectedTemplate.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                  {selectedTemplate.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          )}

          {/* Email Preview */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-100 dark:bg-gray-900 px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500">
              Email Preview
            </div>
            <iframe
              srcDoc={`
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                      margin: 0;
                      padding: 20px;
                      background: white;
                      color: #333;
                    }
                  </style>
                </head>
                <body>${previewHtml}</body>
                </html>
              `}
              className="w-full bg-white"
              style={{ height: '500px', border: 'none' }}
              title="Email Preview"
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteTemplateDialogOpen}
        onClose={() => { setDeleteTemplateDialogOpen(false); setSelectedTemplate(null); }}
        onConfirm={() => selectedTemplate && deleteTemplateMutation.mutate(selectedTemplate.id)}
        title="Delete Template"
        message={`Are you sure you want to delete "${selectedTemplate?.name}"?`}
        isLoading={deleteTemplateMutation.isPending}
      />

      <ConfirmDialog
        isOpen={deleteUserDialogOpen}
        onClose={() => { setDeleteUserDialogOpen(false); setSelectedUser(null); }}
        onConfirm={() => selectedUser && deleteUserMutation.mutate(selectedUser.id)}
        title="Delete User"
        message={`Are you sure you want to delete "${selectedUser?.name}"?`}
        isLoading={deleteUserMutation.isPending}
      />

      <ConfirmDialog
        isOpen={deleteMailServerDialogOpen}
        onClose={() => { setDeleteMailServerDialogOpen(false); setSelectedMailServer(null); }}
        onConfirm={() => selectedMailServer && deleteMailServerMutation.mutate(selectedMailServer.id)}
        title="Delete Mail Server"
        message={`Are you sure you want to delete "${selectedMailServer?.name}"?`}
        isLoading={deleteMailServerMutation.isPending}
      />

      <ConfirmDialog
        isOpen={deleteMailSecurityDialogOpen}
        onClose={() => { setDeleteMailSecurityDialogOpen(false); setSelectedMailSecurity(null); }}
        onConfirm={() => selectedMailSecurity && deleteMailSecurityMutation.mutate(selectedMailSecurity.id)}
        title="Delete Mail Security"
        message={`Are you sure you want to delete "${selectedMailSecurity?.name}"?`}
        isLoading={deleteMailSecurityMutation.isPending}
      />

      <ConfirmDialog
        isOpen={deleteBankAccountDialogOpen}
        onClose={() => { setDeleteBankAccountDialogOpen(false); setSelectedBankAccount(null); }}
        onConfirm={() => selectedBankAccount && deleteBankAccountMutation.mutate(selectedBankAccount.id)}
        title="Delete Bank Account"
        message={`Are you sure you want to delete "${selectedBankAccount?.bankName}"?`}
        isLoading={deleteBankAccountMutation.isPending}
      />

      <ConfirmDialog
        isOpen={deleteNotificationDialogOpen}
        onClose={() => { setDeleteNotificationDialogOpen(false); setSelectedNotification(null); }}
        onConfirm={() => selectedNotification && deleteNotificationMutation.mutate(selectedNotification.id)}
        title="Delete Notification"
        message={`Are you sure you want to delete "${selectedNotification ? typeLabels[selectedNotification.type] : ''}" notification settings?`}
        isLoading={deleteNotificationMutation.isPending}
      />

      {/* Package Modal */}
      <Modal
        isOpen={packageModalOpen}
        onClose={() => { setPackageModalOpen(false); setSelectedPackage(null); }}
        title={selectedPackage ? 'Edit Package' : 'Add Package'}
      >
        <form onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const featuresStr = formData.get('features') as string;
          savePackageMutation.mutate({
            name: formData.get('name') as string,
            description: formData.get('description') as string || null,
            maxMailboxes: parseInt(formData.get('maxMailboxes') as string),
            storageGb: parseFloat(formData.get('storageGb') as string),
            price: parseFloat(formData.get('price') as string),
            features: featuresStr ? featuresStr.split(',').map(f => f.trim()).filter(Boolean) : null,
            mailServerId: selectedMailServerId,
            mailSecurityId: selectedMailSecurityId,
          });
        }} className="space-y-3">
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400">Name *</label>
            <input name="name" defaultValue={selectedPackage?.name} className="input !py-1.5 !text-sm" required />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400">Description</label>
            <input name="description" defaultValue={selectedPackage?.description || ''} className="input !py-1.5 !text-sm" placeholder="Optional" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Max Mailboxes *</label>
              <input name="maxMailboxes" type="number" min="1" defaultValue={selectedPackage?.maxMailboxes || 5} className="input !py-1.5 !text-sm" required />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Storage (GB) *</label>
              <input name="storageGb" type="number" min="0" step="0.1" defaultValue={selectedPackage?.storageGb || 5} className="input !py-1.5 !text-sm" required />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Price (RSD) *</label>
              <input name="price" type="number" min="0" step="0.01" defaultValue={selectedPackage?.price || 0} className="input !py-1.5 !text-sm" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Mail Server</label>
              <select
                value={selectedMailServerId || ''}
                onChange={(e) => setSelectedMailServerId(e.target.value ? parseInt(e.target.value) : null)}
                className="input !py-1.5 !text-sm"
              >
                <option value="">-- None --</option>
                {mailServersData?.servers?.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name} ({server.hostname}){server.isDefault ? ' - Default' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">Mail Security</label>
              <select
                value={selectedMailSecurityId || ''}
                onChange={(e) => setSelectedMailSecurityId(e.target.value ? parseInt(e.target.value) : null)}
                className="input !py-1.5 !text-sm"
              >
                <option value="">-- None --</option>
                {mailSecurityData?.services?.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} ({service.hostname}){service.isDefault ? ' - Default' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400">Features (comma separated)</label>
            <input name="features" defaultValue={selectedPackage?.features?.join(', ') || ''} className="input !py-1.5 !text-sm" placeholder="Webmail, IMAP, Spam filter" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setPackageModalOpen(false)} className="btn btn-secondary !py-1.5 !px-3 !text-sm">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary !py-1.5 !px-4 !text-sm" disabled={savePackageMutation.isPending}>
              {savePackageMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deletePackageDialogOpen}
        onClose={() => { setDeletePackageDialogOpen(false); setSelectedPackage(null); }}
        onConfirm={() => selectedPackage && deletePackageMutation.mutate(selectedPackage.id)}
        title="Delete Package"
        message={`Are you sure you want to delete "${selectedPackage?.name}"?`}
        isLoading={deletePackageMutation.isPending}
      />

      {/* Import Preview Modal */}
      <Modal isOpen={importPreviewOpen} onClose={() => setImportPreviewOpen(false)} title="Import Preview" size="lg">
        <div className="space-y-3">
          {/* File info */}
          {importPreviewMeta && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-400">
              <div><span className="font-medium">File:</span> {importPreviewMeta.fileName}</div>
              <div>
                <span className="font-medium">Version:</span> {importPreviewMeta.version}
                {importPreviewMeta.exportedAt && (
                  <> | <span className="font-medium">Exported:</span> {new Date(importPreviewMeta.exportedAt).toLocaleDateString('sr-RS')}</>
                )}
              </div>
            </div>
          )}

          {/* Category list */}
          {importPreviewData && Object.entries(importPreviewData).map(([type, items]) => {
            const isEmpty = items.length === 0;
            const isExpanded = importExpandedSections.has(type);
            const sectionSelected = isSectionFullySelected(type, importSelections);
            const sectionPartial = isSectionPartiallySelected(type, importSelections);
            const selectedInSection = (importSelections[type] || []).filter(Boolean).length;
            return (
              <div key={type} className={`border rounded-lg overflow-hidden ${isEmpty ? 'border-gray-100 dark:border-gray-800 opacity-50' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className={`flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/30 ${isEmpty ? 'cursor-default' : 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
                  onClick={() => !isEmpty && toggleSectionExpand(type, importExpandedSections, setImportExpandedSections)}
                >
                  {!isEmpty && (
                    <input
                      type="checkbox"
                      checked={sectionSelected}
                      ref={(el) => { if (el) el.indeterminate = sectionPartial; }}
                      onChange={(e) => { e.stopPropagation(); toggleAllInSection(type, importSelections, setImportSelections); }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  )}
                  <span className={`text-sm font-medium flex-1 ${isEmpty ? 'text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-gray-100'}`}>
                    {typeLabelsMap[type] || type} {isEmpty ? '(empty)' : `(${selectedInSection}/${items.length})`}
                  </span>
                  {!isEmpty && (isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />)}
                </div>
                {isExpanded && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/50 max-h-60 overflow-y-auto">
                    {items.map((item, idx) => {
                      const subtitle = getItemSubtitle(type, item as Record<string, unknown>);
                      return (
                        <label key={idx} className={`flex items-center gap-2 px-3 py-2 pl-8 cursor-pointer transition-colors ${
                          importSelections[type]?.[idx] ? 'bg-primary-50/50 dark:bg-primary-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/20'
                        }`}>
                          <input
                            type="checkbox"
                            checked={importSelections[type]?.[idx] ?? false}
                            onChange={() => toggleItem(type, idx, importSelections, setImportSelections)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                              {getItemDisplayName(type, item as Record<string, unknown>)}
                            </div>
                            {subtitle && (
                              <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{subtitle}</div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {getSelectedCount(importSelections) === 0
                ? 'Select items to import'
                : `Selected: ${getSelectedCount(importSelections)} items`}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setImportPreviewOpen(false)}
                className="btn btn-secondary !py-1.5 !px-3 !text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleImportConfirmSelected}
                disabled={getSelectedCount(importSelections) === 0}
                className="btn btn-primary !py-1.5 !px-4 !text-sm"
              >
                Import Selected ({getSelectedCount(importSelections)})
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Export Preview Modal */}
      <Modal isOpen={exportPreviewOpen} onClose={() => setExportPreviewOpen(false)} title="Export Preview" size="lg">
        <div className="space-y-3">
          {/* Category list */}
          {exportPreviewData && Object.entries(exportPreviewData).map(([type, items]) => {
            if (!Array.isArray(items) || items.length === 0) return null;
            const isExpanded = exportExpandedSections.has(type);
            const sectionSelected = isSectionFullySelected(type, exportSelections);
            const sectionPartial = isSectionPartiallySelected(type, exportSelections);
            const selectedInSection = (exportSelections[type] || []).filter(Boolean).length;
            return (
              <div key={type} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/30 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50"
                  onClick={() => toggleSectionExpand(type, exportExpandedSections, setExportExpandedSections)}
                >
                  <input
                    type="checkbox"
                    checked={sectionSelected}
                    ref={(el) => { if (el) el.indeterminate = sectionPartial; }}
                    onChange={(e) => { e.stopPropagation(); toggleAllInSection(type, exportSelections, setExportSelections); }}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1">
                    {typeLabelsMap[type] || type} ({selectedInSection}/{items.length})
                  </span>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
                {isExpanded && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/50 max-h-60 overflow-y-auto">
                    {items.map((item, idx) => {
                      const subtitle = getItemSubtitle(type, item as Record<string, unknown>);
                      return (
                        <label key={idx} className={`flex items-center gap-2 px-3 py-2 pl-8 cursor-pointer transition-colors ${
                          exportSelections[type]?.[idx] ? 'bg-primary-50/50 dark:bg-primary-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/20'
                        }`}>
                          <input
                            type="checkbox"
                            checked={exportSelections[type]?.[idx] ?? true}
                            onChange={() => toggleItem(type, idx, exportSelections, setExportSelections)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                              {getItemDisplayName(type, item as Record<string, unknown>)}
                            </div>
                            {subtitle && (
                              <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{subtitle}</div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Selected: {getSelectedCount(exportSelections)} items
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setExportPreviewOpen(false)}
                className="btn btn-secondary !py-1.5 !px-3 !text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleExportDownload}
                disabled={getSelectedCount(exportSelections) === 0}
                className="btn btn-primary !py-1.5 !px-4 !text-sm"
              >
                Download ({getSelectedCount(exportSelections)})
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
