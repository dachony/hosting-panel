import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Client, Domain, Hosting, ExpiryStatus, ExtendPeriod, Package, MailServer, MailSecurity } from '../types';
import Modal from '../components/common/Modal';
import DateInput from '../components/common/DateInput';
import { ArrowLeft, Globe, Server, Calendar, ChevronDown, ChevronRight, Lock, Unlock, Plus, Search, Pencil, Users, Shield, AlertTriangle, FileText, Upload, Download, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

interface HostingWithPackage extends Hosting {
  expiryStatus: ExpiryStatus;
  packageDescription?: string | null;
  packageMaxMailboxes?: number | null;
  packageStorageGb?: number | null;
  mailServerName?: string | null;
  mailSecurityName?: string | null;
}

interface ClientDetailResponse {
  client: Client;
  domains: Domain[];
  hosting: HostingWithPackage[];
}

const statusColors: Record<ExpiryStatus, { border: string; bg: string; text: string; labelKey: string; dot: string }> = {
  green: { border: 'border-green-500', bg: 'bg-green-500/20', text: 'text-green-600 dark:text-green-400', labelKey: 'common.statusOk', dot: 'bg-green-500' },
  yellow: { border: 'border-yellow-500', bg: 'bg-yellow-500/20', text: 'text-yellow-600 dark:text-yellow-400', labelKey: 'common.statusWarning', dot: 'bg-yellow-500' },
  orange: { border: 'border-orange-500', bg: 'bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400', labelKey: 'common.statusCritical', dot: 'bg-orange-500' },
  red: { border: 'border-red-500', bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400', labelKey: 'common.statusExpired', dot: 'bg-red-500' },
  forDeletion: { border: 'border-purple-500', bg: 'bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400', labelKey: 'common.statusForDeletion', dot: 'bg-purple-500' },
  deleted: { border: 'border-gray-500', bg: 'bg-gray-500/20', text: 'text-gray-600 dark:text-gray-400', labelKey: 'common.statusDeleted', dot: 'bg-gray-500' },
};


const getExpiryStatus = (days: number): ExpiryStatus => {
  if (days <= -60) return 'deleted';
  if (days <= -30) return 'forDeletion';
  if (days <= 0) return 'red';
  if (days <= 7) return 'orange';
  if (days <= 31) return 'yellow';
  return 'green';
};

const extendOptions: { value: ExtendPeriod; labelKey: string }[] = [
  { value: '1year', labelKey: 'common.period1Year' },
  { value: '2years', labelKey: 'common.period2Years' },
  { value: '3years', labelKey: 'common.period3Years' },
  { value: 'unlimited', labelKey: 'common.periodUnlimited' },
];

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Format date for display: YYYY-MM-DD -> DD.MM.YYYY
function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '-';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}.${month}.${year}`;
}

function calculateExpiryDate(startDate: string, years: number): string {
  const date = new Date(startDate);
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().split('T')[0];
}

function getDefaultExpiryDate(): string {
  return calculateExpiryDate(getTodayDate(), 1);
}

const periodButtons = [
  { years: 1, label: '+1' },
  { years: 2, label: '+2' },
  { years: 3, label: '+3' },
  { years: 100, labelKey: 'common.periodShortUnlimited' },
];

export default function ClientDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canWriteData, isSales, isAdmin } = useAuth();

  const [isClientLocked, setIsClientLocked] = useState(true);
  const [isClientExpanded, setIsClientExpanded] = useState(false);
  const [expandedDomains, setExpandedDomains] = useState<Set<number>>(new Set());
  const [clientForm, setClientForm] = useState<Partial<Client>>({});
  const [domainSearch, setDomainSearch] = useState('');
  const [sameAsContact, setSameAsContact] = useState(true);
  const [domainStatusFilter, setDomainStatusFilter] = useState<ExpiryStatus | 'all' | 'noPackage'>('all');
  const [domainSameAsPrimary, setDomainSameAsPrimary] = useState(true);
  const [domainSameAsTech, setDomainSameAsTech] = useState(true);
  const [extendFromToday, setExtendFromToday] = useState(false);
  const [extendModalFromToday, setExtendModalFromToday] = useState(false);
  const [selectedExtendPeriod, setSelectedExtendPeriod] = useState<ExtendPeriod | ''>('');
  const [originalExpiryDate, setOriginalExpiryDate] = useState('');

  // Modals
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendItem, setExtendItem] = useState<{ id: number; name: string } | null>(null);
  const [addDomainModalOpen, setAddDomainModalOpen] = useState(false);
  const [editDomainModalOpen, setEditDomainModalOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  const [editHostingModalOpen, setEditHostingModalOpen] = useState(false);
  const [editingHosting, setEditingHosting] = useState<(Hosting & { expiryStatus: ExpiryStatus }) | null>(null);

  const [addSameAsPrimary, setAddSameAsPrimary] = useState(true);
  const [addSameAsTech, setAddSameAsTech] = useState(true);

  // Forms
  const [domainForm, setDomainForm] = useState({
    domainName: '',
    primaryName: '',
    primaryPhone: '',
    primaryEmail: '',
    techName: '',
    techPhone: '',
    techEmail: '',
    notes: '',
    packageId: '',
    expiryDate: getDefaultExpiryDate(),
  });

  const [editDomainForm, setEditDomainForm] = useState({
    domainName: '',
    clientId: '' as string | number,
    primaryName: '',
    primaryPhone: '',
    primaryEmail: '',
    techName: '',
    techPhone: '',
    techEmail: '',
    packageId: '',
    startDate: '',
    expiryDate: '',
    notes: '',
  });

  const [editHostingForm, setEditHostingForm] = useState({
    packageId: '',
    startDate: '',
    expiryDate: '',
    notes: '',
  });
  const [originalHostingExpiryDate, setOriginalHostingExpiryDate] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get<ClientDetailResponse>(`/api/clients/${id}`),
  });

  const { data: packagesData } = useQuery({
    queryKey: ['packages'],
    queryFn: () => api.get<{ packages: Package[] }>('/api/packages'),
  });

  const { data: allClientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ clients: Client[] }>('/api/clients'),
  });

  useQuery({
    queryKey: ['mail-servers'],
    queryFn: () => api.get<{ mailServers: MailServer[] }>('/api/mail-servers'),
  });

  useQuery({
    queryKey: ['mail-security'],
    queryFn: () => api.get<{ mailSecurity: MailSecurity[] }>('/api/mail-security'),
  });

  useEffect(() => {
    if (data?.client) {
      setClientForm(data.client);
    }
  }, [data?.client]);

  useEffect(() => {
    if (addDomainModalOpen && data?.client) {
      setAddSameAsPrimary(true);
      setAddSameAsTech(true);
      setDomainForm({
        domainName: '',
        primaryName: data.client.contactPerson || '',
        primaryPhone: data.client.phone || '',
        primaryEmail: data.client.email1 || '',
        techName: data.client.techContact || data.client.contactPerson || '',
        techPhone: data.client.techPhone || data.client.phone || '',
        techEmail: data.client.techEmail || data.client.email1 || '',
        notes: '',
        packageId: '',
        expiryDate: getDefaultExpiryDate(),
      });
    }
  }, [addDomainModalOpen, data?.client]);

  const updateClientMutation = useMutation({
    mutationFn: (clientData: Partial<Client>) =>
      api.put(`/api/clients/${id}`, clientData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      toast.success(t('clients.clientUpdated'));
      setIsClientLocked(true);
    },
    onError: () => toast.error(t('common.errorSaving')),
  });

  const extendMutation = useMutation({
    mutationFn: ({ hostingId, period, fromToday }: { hostingId: number; period: ExtendPeriod; fromToday?: boolean }) =>
      api.post(`/api/clients/${id}/extend`, { id: hostingId, period, fromToday }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      toast.success(t('domains.hostingUpdated'));
      setExtendModalOpen(false);
      setExtendItem(null);
      setSelectedExtendPeriod('');
      setExtendModalFromToday(false);
    },
    onError: () => toast.error(t('domains.errorUpdatingHosting')),
  });

  const expireNowMutation = useMutation({
    mutationFn: (hostingId: number) => api.post(`/api/hosting/${hostingId}/expire-now`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      toast.success(t('common.saved'));
      setExtendModalOpen(false);
      setExtendItem(null);
      setSelectedExtendPeriod('');
    },
    onError: (error: Error) => toast.error(error.message || t('common.errorSaving')),
  });

  // PDF mutations
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfUploadDomainId, setPdfUploadDomainId] = useState<number | null>(null);

  const uploadPdfMutation = useMutation({
    mutationFn: ({ domainId, file }: { domainId: number; file: File }) =>
      api.uploadFile<{ pdfFilename: string }>(`/api/domains/${domainId}/pdf`, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success(t('domains.pdfUploaded'));
    },
    onError: (err: Error) => toast.error(err.message || t('domains.errorUploadingPdf')),
  });

  const deletePdfMutation = useMutation({
    mutationFn: (domainId: number) => api.delete(`/api/domains/${domainId}/pdf`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success(t('domains.pdfDeleted'));
    },
    onError: () => toast.error(t('domains.errorDeletingPdf')),
  });

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && pdfUploadDomainId) {
      uploadPdfMutation.mutate({ domainId: pdfUploadDomainId, file });
    }
    e.target.value = '';
  };

  const addDomainMutation = useMutation({
    mutationFn: async (formData: typeof domainForm) => {
      const domainResponse = await api.post<{ domain: Domain }>('/api/domains', {
        clientId: Number(id),
        domainName: formData.domainName,
        primaryContactName: formData.primaryName || null,
        primaryContactPhone: formData.primaryPhone || null,
        primaryContactEmail: formData.primaryEmail || null,
        contactEmail1: formData.techName || null,
        contactEmail2: formData.techPhone || null,
        contactEmail3: formData.techEmail || null,
        notes: formData.notes || undefined,
      });

      if (formData.packageId) {
        await api.post('/api/hosting', {
          clientId: Number(id),
          domainId: domainResponse.domain.id,
          packageId: Number(formData.packageId),
          startDate: getTodayDate(),
          expiryDate: formData.expiryDate,
        });
      }

      return domainResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success(t('domains.domainCreated'));
      setAddDomainModalOpen(false);
    },
    onError: () => toast.error(t('domains.errorCreatingDomain')),
  });

  const editDomainMutation = useMutation({
    mutationFn: async (formData: typeof editDomainForm & { id: number; hostingId?: number }) => {
      await api.put(`/api/domains/${formData.id}`, {
        domainName: formData.domainName,
        clientId: formData.clientId || null,
        primaryContactName: formData.primaryName || null,
        primaryContactPhone: formData.primaryPhone || null,
        primaryContactEmail: formData.primaryEmail || null,
        contactEmail1: formData.techName || null,
        contactEmail2: formData.techPhone || null,
        contactEmail3: formData.techEmail || null,
        notes: formData.notes || undefined,
      });

      // Update or create hosting
      if (formData.packageId && formData.expiryDate) {
        if (formData.hostingId) {
          // Update existing hosting
          await api.put(`/api/hosting/${formData.hostingId}`, {
            packageId: Number(formData.packageId),
            expiryDate: formData.expiryDate,
          });
        } else {
          // Create new hosting
          await api.post('/api/hosting', {
            clientId: formData.clientId || Number(id),
            domainId: formData.id,
            packageId: Number(formData.packageId),
            startDate: getTodayDate(),
            expiryDate: formData.expiryDate,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      toast.success(t('domains.domainUpdated'));
      setEditDomainModalOpen(false);
      setEditingDomain(null);
    },
    onError: () => toast.error(t('domains.errorUpdatingDomain')),
  });

  const editHostingMutation = useMutation({
    mutationFn: (formData: typeof editHostingForm & { id: number }) =>
      api.put(`/api/hosting/${formData.id}`, {
        packageId: Number(formData.packageId),
        expiryDate: formData.expiryDate,
        notes: formData.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      toast.success(t('domains.hostingUpdated'));
      setEditHostingModalOpen(false);
      setEditingHosting(null);
    },
    onError: () => toast.error(t('domains.errorUpdatingHosting')),
  });

  const toggleDomainExpand = (domainId: number) => {
    setExpandedDomains(prev => {
      const next = new Set(prev);
      if (next.has(domainId)) {
        next.delete(domainId);
      } else {
        next.add(domainId);
      }
      return next;
    });
  };

  const handleExtend = (hostingId: number, name: string) => {
    setExtendItem({ id: hostingId, name });
    setExtendModalOpen(true);
  };

  const handleClientSave = () => {
    updateClientMutation.mutate(clientForm);
  };

  const handleClientCancel = () => {
    if (data) {
      setClientForm(data.client);
    }
    setIsClientLocked(true);
  };

  const handleUnlock = () => {
    if (data) {
      // Copy primary to technical contact since sameAsContact is true by default
      setClientForm({
        ...data.client,
        techContact: data.client.contactPerson || '',
        techEmail: data.client.email1 || '',
        techPhone: data.client.phone || '',
      });
    }
    setSameAsContact(true);
    setIsClientLocked(false);
  };

  const handleAddDomainSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    addDomainMutation.mutate(domainForm);
  };

  const handleEditDomain = (domain: Domain) => {
    const domainHosting = getHostingForDomain(domain.id);
    setEditingDomain(domain);
    setExtendFromToday(false);
    // Store original expiry date for display
    const currentExpiryDate = domainHosting?.expiryDate || '';
    setOriginalExpiryDate(currentExpiryDate);

    // Primary contact from domain or fallback to client
    const pName = domain.primaryContactName || client.contactPerson || '';
    const pPhone = domain.primaryContactPhone || client.phone || '';
    const pEmail = domain.primaryContactEmail || client.email1 || '';
    // Technical contact from domain or fallback to client tech
    const tName = domain.contactEmail1 || client.techContact || client.contactPerson || '';
    const tPhone = domain.contactEmail2 || client.techPhone || client.phone || '';
    const tEmail = domain.contactEmail3 || client.techEmail || client.email1 || '';

    // Check if contacts match company contacts
    setDomainSameAsPrimary(
      pName === (client.contactPerson || '') &&
      pPhone === (client.phone || '') &&
      pEmail === (client.email1 || '')
    );
    setDomainSameAsTech(
      tName === (client.techContact || client.contactPerson || '') &&
      tPhone === (client.techPhone || client.phone || '') &&
      tEmail === (client.techEmail || client.email1 || '')
    );

    setEditDomainForm({
      domainName: domain.domainName,
      clientId: client.id,
      primaryName: pName,
      primaryPhone: pPhone,
      primaryEmail: pEmail,
      techName: tName,
      techPhone: tPhone,
      techEmail: tEmail,
      packageId: domainHosting?.packageId?.toString() || '',
      startDate: domainHosting?.startDate || '',
      expiryDate: currentExpiryDate || getDefaultExpiryDate(),
      notes: domain.notes || '',
    });
    setEditDomainModalOpen(true);
  };

  const handleEditDomainSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (editingDomain) {
      const domainHosting = getHostingForDomain(editingDomain.id);
      editDomainMutation.mutate({
        ...editDomainForm,
        id: editingDomain.id,
        hostingId: domainHosting?.id ?? undefined,
      });
    }
  };

  const handleEditHosting = (hosting: Hosting & { expiryStatus: ExpiryStatus }) => {
    setEditingHosting(hosting);
    setOriginalHostingExpiryDate(hosting.expiryDate || '');
    setEditHostingForm({
      packageId: hosting.packageId?.toString() || '',
      startDate: hosting.startDate || '',
      expiryDate: hosting.expiryDate || '',
      notes: hosting.notes || '',
    });
    setEditHostingModalOpen(true);
  };

  const handleEditHostingSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (editingHosting) {
      editHostingMutation.mutate({ ...editHostingForm, id: editingHosting.id! });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!data) {
    return <div>{t('clients.clientNotFound')}</div>;
  }

  const { client, domains, hosting } = data;

  const StatusBadge = ({ status, days }: { status: ExpiryStatus; days: number }) => {
    const config = statusColors[status];

    let label: string;
    if (status === 'deleted') {
      label = t('common.statusDeleted');
    } else if (status === 'forDeletion') {
      label = t('common.statusForDeletion');
    } else if (days <= 0) {
      label = t('common.statusExpired');
    } else if (status === 'green') {
      label = t('common.statusOk');
    } else {
      label = t('common.statusExpiring');
    }

    const showDays = days > 0;
    const daysStr = showDays ? (days > 36000 ? '∞' : `${days} ${t('dashboard.daysLeft')}`) : null;

    return (
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dot}`}></div>
        <span className={`text-xs font-semibold ${config.text} whitespace-nowrap`}>
          {label}{daysStr ? ` | ${daysStr}` : ''}
        </span>
      </div>
    );
  };

  const getHostingForDomain = (domainId: number) => hosting.find(h => h.domainId === domainId);

  const filteredDomains = domains.filter((domain) => {
    // Status filter
    if (domainStatusFilter === 'noPackage') {
      const domainHosting = getHostingForDomain(domain.id);
      if (domainHosting) return false;
    } else if (domainStatusFilter !== 'all') {
      const domainHosting = getHostingForDomain(domain.id);
      if (!domainHosting) return false;
      const status = domainHosting.expiryStatus || getExpiryStatus(domainHosting.daysUntilExpiry || 0);
      if (status !== domainStatusFilter) return false;
    }

    // Search filter
    if (!domainSearch.trim()) return true;
    const search = domainSearch.toLowerCase();
    return (
      domain.domainName.toLowerCase().includes(search) ||
      domain.contactEmail1?.toLowerCase().includes(search) ||
      domain.contactEmail2?.toLowerCase().includes(search) ||
      domain.contactEmail3?.toLowerCase().includes(search)
    );
  }).sort((a, b) => a.domainName.localeCompare(b.domainName));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/clients')}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {client.name}
        </h1>
      </div>

      {/* Client Info Section */}
      <div className="card card-flush overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center">
            <Users className="w-4 h-4 mr-2 text-primary-600" />
            <h2 className="text-base font-semibold">{t('common.client')}</h2>
          </div>
        </div>

        {/* Client Row - Collapsible */}
        <div className="border-t dark:border-gray-700">
          {/* Client Header */}
          <div
            onClick={() => setIsClientExpanded(!isClientExpanded)}
            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isClientExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
              <Users className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
              <span className="font-medium text-sm flex-shrink-0">{client.name}</span>
              <span className="text-gray-400 mx-1 flex-shrink-0 hidden sm:inline">|</span>
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate hidden sm:inline">
                <span className="text-gray-500 font-medium">{t('common.primaryContact')}</span> {[client.contactPerson, client.phone, client.email1].filter(Boolean).join(', ') || '-'}
              </span>
              <span className="text-gray-400 mx-1 flex-shrink-0 hidden sm:inline">|</span>
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate hidden sm:inline">
                <span className="text-gray-500 font-medium">{t('common.technicalContact')}</span> {[client.techContact || client.contactPerson, client.techPhone || client.phone, client.techEmail || client.email1].filter(Boolean).join(', ') || '-'}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canWriteData && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isClientLocked) {
                      handleUnlock();
                      setIsClientExpanded(true);
                    } else {
                      handleClientSave();
                    }
                  }}
                  className="btn btn-secondary btn-sm flex items-center gap-1"
                >
                  {isClientLocked ? (
                    <>
                      <Pencil className="w-3 h-3" />
                      {t('common.edit')}
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3" />
                      {t('common.save')}
                    </>
                  )}
                </button>
              )}
              {!isClientLocked && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClientCancel();
                  }}
                  className="btn btn-secondary btn-sm flex items-center gap-1"
                >
                  <Unlock className="w-3 h-3" />
                  {t('common.cancel')}
                </button>
              )}
            </div>
          </div>

          {/* Client Details (Expanded) */}
          {isClientExpanded && (
            <div className="border-t dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50 space-y-3">
              {/* Client Name & Business Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.name')}</span>
                  {isClientLocked ? (
                    <div className="mt-1 font-medium text-sm">{client.name}</div>
                  ) : (
                    <input
                      type="text"
                      value={clientForm.name || ''}
                      onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                      className="input input-sm mt-1"
                      required
                    />
                  )}
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.address')}</span>
                  {isClientLocked ? (
                    <div className="mt-1 font-medium text-sm">{client.address || '-'}</div>
                  ) : (
                    <input
                      type="text"
                      value={clientForm.address || ''}
                      onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                      className="input input-sm mt-1"
                    />
                  )}
                </div>
              </div>

              {/* Primary Contact */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.primaryContact')}</span>
                <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{t('common.nameAndSurname')}</label>
                    {isClientLocked ? (
                      <div className="text-sm">{client.contactPerson || '-'}</div>
                    ) : (
                      <input
                        type="text"
                        value={clientForm.contactPerson || ''}
                        onChange={(e) => setClientForm({ ...clientForm, contactPerson: e.target.value })}
                        className="input input-sm"
                        required
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{t('common.phone')}</label>
                    {isClientLocked ? (
                      <div className="text-sm">{client.phone || '-'}</div>
                    ) : (
                      <input
                        type="text"
                        value={clientForm.phone || ''}
                        onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                        className="input input-sm"
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{t('common.email')}</label>
                    {isClientLocked ? (
                      <div className="text-sm">{client.email1 || '-'}</div>
                    ) : (
                      <input
                        type="email"
                        value={clientForm.email1 || ''}
                        onChange={(e) => setClientForm({ ...clientForm, email1: e.target.value })}
                        className="input input-sm"
                        required
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Technical Contact */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.technicalContact')}</span>
                  {!isClientLocked && (
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sameAsContact}
                        onChange={(e) => {
                          setSameAsContact(e.target.checked);
                          if (e.target.checked) {
                            setClientForm({
                              ...clientForm,
                              techContact: clientForm.contactPerson || '',
                              techEmail: clientForm.email1 || '',
                              techPhone: clientForm.phone || '',
                            });
                          }
                        }}
                        className="w-3 h-3 rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-gray-500">{t('common.sameAsPrimaryContact')}</span>
                    </label>
                  )}
                </div>
                <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{t('common.nameAndSurname')}</label>
                    {isClientLocked ? (
                      <div className="text-sm">{client.techContact || client.contactPerson || '-'}</div>
                    ) : (
                      <input
                        type="text"
                        value={clientForm.techContact || ''}
                        onChange={(e) => setClientForm({ ...clientForm, techContact: e.target.value })}
                        className="input input-sm"
                        disabled={sameAsContact}
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{t('common.phone')}</label>
                    {isClientLocked ? (
                      <div className="text-sm">{client.techPhone || client.phone || '-'}</div>
                    ) : (
                      <input
                        type="text"
                        value={clientForm.techPhone || ''}
                        onChange={(e) => setClientForm({ ...clientForm, techPhone: e.target.value })}
                        className="input input-sm"
                        disabled={sameAsContact}
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{t('common.email')}</label>
                    {isClientLocked ? (
                      <div className="text-sm">{client.techEmail || client.email1 || '-'}</div>
                    ) : (
                      <input
                        type="email"
                        value={clientForm.techEmail || ''}
                        onChange={(e) => setClientForm({ ...clientForm, techEmail: e.target.value })}
                        className="input input-sm"
                        disabled={sameAsContact}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* PIB/MIB */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.businessInfo')}</span>
                <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">PIB</label>
                    {isClientLocked ? (
                      <div className="text-sm">{client.pib || '-'}</div>
                    ) : (
                      <input
                        type="text"
                        value={clientForm.pib || ''}
                        onChange={(e) => setClientForm({ ...clientForm, pib: e.target.value })}
                        className="input input-sm"
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">MIB</label>
                    {isClientLocked ? (
                      <div className="text-sm">{client.mib || '-'}</div>
                    ) : (
                      <input
                        type="text"
                        value={clientForm.mib || ''}
                        onChange={(e) => setClientForm({ ...clientForm, mib: e.target.value })}
                        className="input input-sm"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.notes')}</span>
                {isClientLocked ? (
                  <div className="mt-1 text-sm">{client.notes || '-'}</div>
                ) : (
                  <textarea
                    value={clientForm.notes || ''}
                    onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                    className="input input-sm mt-1"
                    rows={2}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Domains Section */}
      <div className="card card-flush overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b dark:border-gray-700">
          <div className="flex items-center">
            <Globe className="w-4 h-4 mr-2 text-primary-600" />
            <h2 className="text-base font-semibold">{t('domains.title')} ({domains.length})</h2>
          </div>
          {canWriteData && (
            <button
              onClick={() => setAddDomainModalOpen(true)}
              className="btn btn-primary btn-sm flex items-center"
            >
              <Plus className="w-3 h-3 mr-1" />
              {t('common.add')}
            </button>
          )}
        </div>

        {/* Search and Filter */}
        <div className="px-3 py-2 border-b dark:border-gray-700 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={domainSearch}
              onChange={(e) => setDomainSearch(e.target.value)}
              placeholder={t('common.searchPlaceholder')}
              className="input input-sm w-full pl-8"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setDomainStatusFilter('all')}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                domainStatusFilter === 'all'
                  ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {t('common.all')}
            </button>
            {(['green', 'yellow', 'orange', 'red', 'forDeletion', 'deleted'] as ExpiryStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => setDomainStatusFilter(status)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                  domainStatusFilter === status
                    ? `${statusColors[status].bg} ${statusColors[status].text}`
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${statusColors[status].dot}`}></span>
                {t(statusColors[status].labelKey)}
              </button>
            ))}
            <button
              onClick={() => setDomainStatusFilter('noPackage')}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                domainStatusFilter === 'noPackage'
                  ? 'bg-gray-500/20 text-gray-600 dark:text-gray-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-gray-400"></span>
              {t('common.statusNoPackage')}
            </button>
          </div>
        </div>

        {domains.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">{t('domains.noDomains')}</p>
        ) : filteredDomains.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">{t('common.noResults')}</p>
        ) : (
          <div className="space-y-3">
            {filteredDomains.map((domain) => {
              const isExpanded = expandedDomains.has(domain.id);
              const domainHosting = getHostingForDomain(domain.id);

              return (
                <div
                  key={domain.id}
                  className="border dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* Domain Header */}
                  <div
                    onClick={() => toggleDomainExpand(domain.id)}
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    {/* Expand Icon + Domain Name */}
                    <div className="w-36 sm:w-44 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <Globe className="w-4 h-4 text-primary-600 flex-shrink-0" />
                        <span className="font-medium text-sm">{domain.domainName}</span>
                      </div>
                    </div>

                    {/* Contacts */}
                    <div className="flex-1 min-w-0 text-xs space-y-0.5 hidden sm:block">
                      <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400 whitespace-nowrap overflow-hidden">
                        <span className="text-gray-500 font-medium flex-shrink-0">{t('common.primaryContact')}</span>
                        <span className="truncate">{[domain.primaryContactName || client.contactPerson, domain.primaryContactPhone || client.phone, domain.primaryContactEmail || client.email1].filter(Boolean).join(', ') || '-'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400 whitespace-nowrap overflow-hidden">
                        <span className="text-gray-500 font-medium flex-shrink-0">{t('common.technicalContact')}</span>
                        <span className="truncate">{[domain.contactEmail1 || client.techContact || client.contactPerson, domain.contactEmail2 || client.techPhone || client.phone, domain.contactEmail3 || client.techEmail || client.email1].filter(Boolean).join(', ') || '-'}</span>
                      </div>
                    </div>

                    {/* Package Info */}
                    <div className="w-28 sm:w-36 flex-shrink-0 text-xs text-left hidden sm:block">
                      {domainHosting ? (
                        <>
                          <div className="text-gray-700 dark:text-gray-300 font-medium truncate">
                            {domainHosting.packageName || '—'}
                          </div>
                          <div className="text-gray-500 truncate">
                            {(domainHosting as HostingWithPackage).packageMaxMailboxes || 0} {t('common.mailboxes')} · {(domainHosting as HostingWithPackage).packageStorageGb || 0} GB
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0"></div>
                          <span className="text-xs text-gray-400 font-medium">{t('common.statusNoPackage')}</span>
                        </div>
                      )}
                    </div>

                    {/* Status */}
                    <div className="w-24 sm:w-32 flex-shrink-0">
                      {domainHosting ? (
                        <StatusBadge status={domainHosting.expiryStatus} days={domainHosting.daysUntilExpiry || 0} />
                      ) : null}
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                      {canWriteData && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditDomain(domain);
                          }}
                          className="text-xs py-1 px-2 flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"
                        >
                          <Pencil className="w-3 h-3" />
                          <span className="hidden sm:inline">{t('common.edit')}</span>
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (domainHosting) handleExtend(domainHosting.id!, domain.domainName);
                        }}
                        disabled={!domainHosting}
                        className="btn btn-primary text-xs py-1 px-2 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Calendar className="w-3 h-3" />
                        <span className="hidden sm:inline">{t('common.extend')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Domain Details (Expanded) */}
                  {isExpanded && (
                    <div className="border-t dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50 space-y-4">
                      {/* Company */}
                      <div className="text-sm">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.company')}</span>
                        <div className="mt-1 font-medium">{client.name}</div>
                      </div>

                      {/* Contacts Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Primary Contact */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.primaryContact')}</span>
                          <div className="mt-2 text-sm text-gray-700 dark:text-gray-300 truncate">
                            {[domain.primaryContactName || client.contactPerson, domain.primaryContactPhone || client.phone, domain.primaryContactEmail || client.email1].filter(Boolean).join(', ') || '-'}
                          </div>
                        </div>

                        {/* Technical Contact */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.technicalContact')}</span>
                          <div className="mt-2 text-sm text-gray-700 dark:text-gray-300 truncate">
                            {[domain.contactEmail1 || client.techContact || client.contactPerson, domain.contactEmail2 || client.techPhone || client.phone, domain.contactEmail3 || client.techEmail || client.email1].filter(Boolean).join(', ') || '-'}
                          </div>
                        </div>
                      </div>

                      {/* Notes */}
                      {domain.notes && (
                        <div className="text-sm">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.notes')}</span>
                          <div className="mt-1">{domain.notes}</div>
                        </div>
                      )}

                      {/* Hosting Section - Clickable */}
                      <div
                        onClick={() => canWriteData && domainHosting && handleEditHosting(domainHosting)}
                        className={`border dark:border-gray-600 rounded-lg p-3 ${canWriteData && domainHosting ? 'cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 transition-colors' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Server className="w-4 h-4 text-primary-600" />
                            <span className="font-medium text-sm">{t('domains.hosting')}</span>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              domainHosting
                                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                            }`}>
                              {domainHosting ? t('domains.active') : t('domains.inactive')}
                            </span>
                            {canWriteData && domainHosting && (
                              <span className="text-xs text-gray-400">({t('domains.clickToEdit')})</span>
                            )}
                          </div>
                        </div>
                        {domainHosting && (
                          <>
                            <div className="mt-2 pt-2 border-t dark:border-gray-700 flex items-center gap-4 text-xs flex-wrap">
                              <div className="flex items-center gap-1">
                                <span className="text-gray-500">{t('common.package')}:</span>
                                <span className="font-medium">{domainHosting.packageName || '-'}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-gray-500">{(domainHosting as HostingWithPackage).packageMaxMailboxes || 0} {t('common.mailboxes')}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-gray-500">{(domainHosting as HostingWithPackage).packageStorageGb || 0} GB</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Server className="w-3 h-3 text-gray-400" />
                                <span className="text-gray-500 font-medium">{t('common.mailServer')}</span>
                                <span>{(domainHosting as HostingWithPackage).mailServerName || '-'}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Shield className="w-3 h-3 text-gray-400" />
                                <span className="text-gray-500 font-medium">{t('common.mailSecurity')}</span>
                                <span>{(domainHosting as HostingWithPackage).mailSecurityName || '-'}</span>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t dark:border-gray-700 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1">
                                <span className="text-gray-500">{t('common.expiry')}</span>
                                <span className="font-medium">{formatDateDisplay(domainHosting.expiryDate!)}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <StatusBadge status={domainHosting.expiryStatus} days={domainHosting.daysUntilExpiry || 0} />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleExtend(domainHosting.id!, domainHosting.packageName || 'Hosting');
                                  }}
                                  className="btn btn-primary text-xs py-1 px-2 flex items-center gap-1"
                                >
                                  <Calendar className="w-3 h-3" />
                                  {t('common.extend')}
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* PDF Document */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-primary-600" />
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('domains.pdfDocument')}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {domain.pdfFilename ? (
                              <>
                                <span className="text-xs text-gray-600 dark:text-gray-400">{domain.pdfFilename}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); api.download(`/api/domains/${domain.id}/pdf`, domain.pdfFilename!); }}
                                  className="p-1 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
                                  title={t('common.download')}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                {!isSales && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); deletePdfMutation.mutate(domain.id); }}
                                    className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded transition-colors"
                                    title={t('common.delete')}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">{t('domains.noPdf')}</span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setPdfUploadDomainId(domain.id); pdfInputRef.current?.click(); }}
                              className="btn btn-secondary btn-xs flex items-center gap-1"
                            >
                              <Upload className="w-3 h-3" />
                              {t('domains.uploadPdf')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hidden PDF input */}
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf"
        onChange={handlePdfUpload}
        className="hidden"
      />

      {/* Extend Modal */}
      <Modal
        isOpen={extendModalOpen}
        onClose={() => {
          setExtendModalOpen(false);
          setExtendItem(null);
          setSelectedExtendPeriod('');
          setExtendModalFromToday(false);
        }}
        title={`${t('common.extend')}: ${extendItem?.name || ''}`}
        size="sm"
      >
        <div className="space-y-4">
          {/* From Today / From Expiry Date */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="extendModalFrom"
                checked={!extendModalFromToday}
                onChange={() => setExtendModalFromToday(false)}
                className="w-4 h-4 text-primary-600"
              />
              <span className="text-gray-700 dark:text-gray-300">{t('common.fromExpiryDate')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="extendModalFrom"
                checked={extendModalFromToday}
                onChange={() => setExtendModalFromToday(true)}
                className="w-4 h-4 text-primary-600"
              />
              <span className="text-gray-700 dark:text-gray-300">{t('common.fromToday')}</span>
            </label>
          </div>

          {/* Period Selection */}
          <div className="space-y-2">
            {extendOptions.map((option) => (
              <label
                key={option.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedExtendPeriod === option.value
                    ? 'border-primary-500 bg-primary-50 dark:bg-gray-700/50'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <input
                  type="radio"
                  name="extendPeriod"
                  value={option.value}
                  checked={selectedExtendPeriod === option.value}
                  onChange={() => setSelectedExtendPeriod(option.value)}
                  className="w-4 h-4 text-primary-600"
                />
                <span className="font-medium">{t(option.labelKey)}</span>
              </label>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex justify-between items-center pt-3 border-t dark:border-gray-700">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => {
                  if (extendItem) {
                    expireNowMutation.mutate(extendItem.id);
                  }
                }}
                disabled={expireNowMutation.isPending}
                className="btn btn-sm flex items-center gap-1 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150"
              >
                <AlertTriangle className="w-3 h-3" />
                {expireNowMutation.isPending ? t('common.saving') : t('common.expireNow')}
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setExtendModalOpen(false);
                  setExtendItem(null);
                  setSelectedExtendPeriod('');
                  setExtendModalFromToday(false);
                }}
                className="btn btn-secondary py-1.5 px-3 text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedExtendPeriod && extendItem) {
                    extendMutation.mutate({
                      hostingId: extendItem.id,
                      period: selectedExtendPeriod,
                      fromToday: extendModalFromToday,
                    });
                  }
                }}
                disabled={!selectedExtendPeriod || extendMutation.isPending}
                className="btn btn-primary py-1.5 px-3 text-sm"
              >
                {extendMutation.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Add Domain Modal */}
      <Modal
        isOpen={addDomainModalOpen}
        onClose={() => setAddDomainModalOpen(false)}
        title={t('domains.addDomain')}
        size="lg"
      >
        <form onSubmit={handleAddDomainSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">{t('common.domain')} *</label>
            <input
              value={domainForm.domainName}
              onChange={(e) => setDomainForm({ ...domainForm, domainName: e.target.value })}
              className="input py-1.5 text-sm"
              placeholder="example.com"
              required
            />
          </div>

          {/* Primary Contact */}
          <div className="pt-3 border-t dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase">{t('common.primaryContact')}</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={addSameAsPrimary}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAddSameAsPrimary(checked);
                    if (checked && data?.client) {
                      setDomainForm(prev => ({
                        ...prev,
                        primaryName: data.client.contactPerson || '',
                        primaryPhone: data.client.phone || '',
                        primaryEmail: data.client.email1 || '',
                      }));
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600"
                />
                <span className="text-gray-500">{t('common.sameAsCompanyPrimary')}</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500">{t('common.nameAndSurname')} *</label>
                <input
                  value={domainForm.primaryName}
                  onChange={(e) => setDomainForm({ ...domainForm, primaryName: e.target.value })}
                  className="input py-1.5 text-sm"
                  disabled={addSameAsPrimary}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.phone')} *</label>
                <input
                  value={domainForm.primaryPhone}
                  onChange={(e) => setDomainForm({ ...domainForm, primaryPhone: e.target.value })}
                  className="input py-1.5 text-sm"
                  disabled={addSameAsPrimary}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.email')} *</label>
                <input
                  type="email"
                  value={domainForm.primaryEmail}
                  onChange={(e) => setDomainForm({ ...domainForm, primaryEmail: e.target.value })}
                  className="input py-1.5 text-sm"
                  disabled={addSameAsPrimary}
                  required
                />
              </div>
            </div>
          </div>

          {/* Technical Contact */}
          <div className="pt-3 border-t dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase">{t('common.technicalContact')}</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={addSameAsTech}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAddSameAsTech(checked);
                    if (checked && data?.client) {
                      setDomainForm(prev => ({
                        ...prev,
                        techName: data.client.techContact || data.client.contactPerson || '',
                        techPhone: data.client.techPhone || data.client.phone || '',
                        techEmail: data.client.techEmail || data.client.email1 || '',
                      }));
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600"
                />
                <span className="text-gray-500">{t('common.sameAsCompanyTechnical')}</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500">{t('common.nameAndSurname')} *</label>
                <input
                  value={domainForm.techName}
                  onChange={(e) => setDomainForm({ ...domainForm, techName: e.target.value })}
                  className="input py-1.5 text-sm"
                  disabled={addSameAsTech}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.phone')} *</label>
                <input
                  value={domainForm.techPhone}
                  onChange={(e) => setDomainForm({ ...domainForm, techPhone: e.target.value })}
                  className="input py-1.5 text-sm"
                  disabled={addSameAsTech}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.email')} *</label>
                <input
                  type="email"
                  value={domainForm.techEmail}
                  onChange={(e) => setDomainForm({ ...domainForm, techEmail: e.target.value })}
                  className="input py-1.5 text-sm"
                  disabled={addSameAsTech}
                  required
                />
              </div>
            </div>
          </div>

          {/* Hosting Package */}
          <div className="pt-3 border-t dark:border-gray-700">
            <span className="text-xs font-medium text-gray-500 uppercase">{t('domains.hosting')}</span>
            <div className="mt-2">
              <label className="text-xs text-gray-500">{t('common.package')}</label>
              <select
                value={domainForm.packageId}
                onChange={(e) => setDomainForm({ ...domainForm, packageId: e.target.value })}
                className="input py-1.5 text-sm"
              >
                <option value="">{t('common.noPackage')}</option>
                {packagesData?.packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name}
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const selectedPkg = packagesData?.packages.find(p => p.id === Number(domainForm.packageId));
              if (!selectedPkg) return null;
              return (
                <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  {selectedPkg.description && (
                    <div className="text-sm text-gray-700 dark:text-gray-300 mb-1.5">{selectedPkg.description}</div>
                  )}
                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{selectedPkg.maxMailboxes} {t('common.mailboxes')}</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{selectedPkg.storageGb} GB</span>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-700 flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <Server className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-500 font-medium">{t('common.mailServer')}</span>
                      <span className="text-gray-700 dark:text-gray-300">{selectedPkg.mailServerName || '-'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Shield className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-500 font-medium">{t('common.mailSecurity')}</span>
                      <span className="text-gray-700 dark:text-gray-300">{selectedPkg.mailSecurityName || '-'}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Dates & Extend */}
          {domainForm.packageId && (
            <div className="pt-3 border-t dark:border-gray-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div />
                <div className="bg-primary-50 dark:bg-gray-700/50 rounded-lg p-3 -m-1">
                  <span className="text-xs font-medium text-primary-700 dark:text-primary-300 uppercase">{t('common.expiry')} *</span>
                  <div className="mt-2">
                    <DateInput
                      name="addDomainExpiryDate"
                      value={domainForm.expiryDate}
                      onChange={(value) => setDomainForm({ ...domainForm, expiryDate: value })}
                      required
                    />
                    <div className="flex gap-1.5 flex-wrap mt-2">
                      {periodButtons.map((btn) => (
                        <button
                          key={btn.years}
                          type="button"
                          onClick={() => setDomainForm({
                            ...domainForm,
                            expiryDate: calculateExpiryDate(getTodayDate(), btn.years)
                          })}
                          className="btn btn-secondary text-xs py-1 px-2"
                        >
                          {'labelKey' in btn ? t(btn.labelKey as string) : btn.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="pt-3 border-t dark:border-gray-700">
            <label className="text-xs text-gray-500">{t('common.notes')}</label>
            <textarea
              value={domainForm.notes}
              onChange={(e) => setDomainForm({ ...domainForm, notes: e.target.value })}
              className="input py-1.5 text-sm"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={() => setAddDomainModalOpen(false)}
              className="btn btn-secondary py-1.5 px-3 text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary py-1.5 px-3 text-sm"
              disabled={addDomainMutation.isPending}
            >
              {addDomainMutation.isPending ? t('common.creating') : t('common.add')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Domain Modal */}
      <Modal
        isOpen={editDomainModalOpen}
        onClose={() => {
          setEditDomainModalOpen(false);
          setEditingDomain(null);
        }}
        title={`${t('common.edit')}: ${editingDomain?.domainName || ''}`}
        size="lg"
      >
        <form onSubmit={handleEditDomainSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">{t('common.domain')} *</label>
            <input
              value={editDomainForm.domainName}
              onChange={(e) => setEditDomainForm({ ...editDomainForm, domainName: e.target.value })}
              className="input py-1.5 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">{t('common.company')}</label>
            <select
              value={editDomainForm.clientId}
              onChange={(e) => {
                const newClientId = e.target.value ? Number(e.target.value) : '';
                const selClient = allClientsData?.clients.find(c => c.id === newClientId);
                const updates: Partial<typeof editDomainForm> = { clientId: newClientId };
                if (selClient) {
                  if (domainSameAsPrimary) {
                    updates.primaryName = selClient.contactPerson || '';
                    updates.primaryPhone = selClient.phone || '';
                    updates.primaryEmail = selClient.email1 || '';
                  }
                  if (domainSameAsTech) {
                    updates.techName = selClient.techContact || selClient.contactPerson || '';
                    updates.techPhone = selClient.techPhone || selClient.phone || '';
                    updates.techEmail = selClient.techEmail || selClient.email1 || '';
                  }
                } else {
                  if (domainSameAsPrimary) {
                    updates.primaryName = '';
                    updates.primaryPhone = '';
                    updates.primaryEmail = '';
                  }
                  if (domainSameAsTech) {
                    updates.techName = '';
                    updates.techPhone = '';
                    updates.techEmail = '';
                  }
                }
                setEditDomainForm({ ...editDomainForm, ...updates });
              }}
              className="input py-1.5 text-sm"
            >
              <option value="">{t('common.selectClient')}</option>
              {[...(allClientsData?.clients || [])].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Primary Contact */}
          <div className="pt-3 border-t dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase">{t('common.primaryContact')}</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={domainSameAsPrimary}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDomainSameAsPrimary(checked);
                    if (checked) {
                      const selClient = allClientsData?.clients.find(c => c.id === editDomainForm.clientId) || client;
                      setEditDomainForm({
                        ...editDomainForm,
                        primaryName: selClient.contactPerson || '',
                        primaryPhone: selClient.phone || '',
                        primaryEmail: selClient.email1 || '',
                      });
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600"
                />
                <span className="text-gray-500">{t('common.sameAsCompanyPrimary')}</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500">{t('common.nameAndSurname')} *</label>
                <input
                  value={editDomainForm.primaryName}
                  onChange={(e) => setEditDomainForm({ ...editDomainForm, primaryName: e.target.value })}
                  className="input py-1.5 text-sm"
                  disabled={domainSameAsPrimary}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.phone')} *</label>
                <input
                  value={editDomainForm.primaryPhone}
                  onChange={(e) => setEditDomainForm({ ...editDomainForm, primaryPhone: e.target.value })}
                  className="input py-1.5 text-sm"
                  disabled={domainSameAsPrimary}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.email')} *</label>
                <input
                  type="email"
                  value={editDomainForm.primaryEmail}
                  onChange={(e) => setEditDomainForm({ ...editDomainForm, primaryEmail: e.target.value })}
                  className="input py-1.5 text-sm"
                  disabled={domainSameAsPrimary}
                  required
                />
              </div>
            </div>
          </div>

          {/* Technical Contact */}
          <div className="pt-3 border-t dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase">{t('common.technicalContact')}</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={domainSameAsTech}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDomainSameAsTech(checked);
                    if (checked) {
                      const selClient = allClientsData?.clients.find(c => c.id === editDomainForm.clientId) || client;
                      setEditDomainForm({
                        ...editDomainForm,
                        techName: selClient.techContact || selClient.contactPerson || '',
                        techPhone: selClient.techPhone || selClient.phone || '',
                        techEmail: selClient.techEmail || selClient.email1 || '',
                      });
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600"
                />
                <span className="text-gray-500">{t('common.sameAsCompanyTechnical')}</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500">{t('common.nameAndSurname')} *</label>
                <input
                  value={editDomainForm.techName}
                  onChange={(e) => setEditDomainForm({ ...editDomainForm, techName: e.target.value })}
                  className="input py-1.5 text-sm"
                  disabled={domainSameAsTech}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.phone')} *</label>
                <input
                  value={editDomainForm.techPhone}
                  onChange={(e) => setEditDomainForm({ ...editDomainForm, techPhone: e.target.value })}
                  className="input py-1.5 text-sm"
                  disabled={domainSameAsTech}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.email')} *</label>
                <input
                  type="email"
                  value={editDomainForm.techEmail}
                  onChange={(e) => setEditDomainForm({ ...editDomainForm, techEmail: e.target.value })}
                  className="input py-1.5 text-sm"
                  disabled={domainSameAsTech}
                  required
                />
              </div>
            </div>
          </div>

          {/* Hosting Package */}
          <div className="pt-3 border-t dark:border-gray-700">
            <span className="text-xs font-medium text-gray-500 uppercase">{t('domains.hosting')}</span>
            <div className="mt-2">
              <label className="text-xs text-gray-500">{t('common.package')}</label>
              <select
                value={editDomainForm.packageId}
                onChange={(e) => setEditDomainForm({ ...editDomainForm, packageId: e.target.value })}
                className="input py-1.5 text-sm"
              >
                <option value="">{t('common.noPackage')}</option>
                {packagesData?.packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name}
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const selectedPkg = packagesData?.packages.find(p => p.id === Number(editDomainForm.packageId));
              if (!selectedPkg) return null;
              return (
                <>
                  <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    {selectedPkg.description && (
                      <div className="text-sm text-gray-700 dark:text-gray-300 mb-1.5">{selectedPkg.description}</div>
                    )}
                    <div className="flex items-center gap-4 text-xs">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{selectedPkg.maxMailboxes} {t('common.mailboxes')}</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">{selectedPkg.storageGb} GB</span>
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-700 flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1">
                        <Server className="w-3 h-3 text-gray-400" />
                        <span className="text-gray-500 font-medium">{t('common.mailServer')}</span>
                        <span className="text-gray-700 dark:text-gray-300">{selectedPkg.mailServerName || '-'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Shield className="w-3 h-3 text-gray-400" />
                        <span className="text-gray-500 font-medium">{t('common.mailSecurity')}</span>
                        <span className="text-gray-700 dark:text-gray-300">{selectedPkg.mailSecurityName || '-'}</span>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Dates & Extend */}
          <div className="pt-3 border-t dark:border-gray-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Left: Start Date and Expiry Date (read-only) */}
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">{t('common.added')}</span>
                  <div className="mt-1 py-2 px-3 bg-gray-100 dark:bg-gray-800 rounded text-sm font-medium">
                    {formatDateDisplay(editDomainForm.startDate) || '-'}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">{t('common.expiry')}</span>
                  <div className="mt-1 py-2 px-3 bg-gray-100 dark:bg-gray-800 rounded text-sm font-medium">
                    {formatDateDisplay(originalExpiryDate) || '-'}
                  </div>
                </div>
              </div>

              {/* Right: Extend To Date */}
              <div className="bg-primary-50 dark:bg-gray-700/50 rounded-lg p-3 -m-1">
                <span className="text-xs font-medium text-primary-700 dark:text-primary-300 uppercase">{t('common.extendTo')}</span>
                <div className="mt-2">
                  <DateInput
                    name="editDomainExpiryDate"
                    value={editDomainForm.expiryDate}
                    onChange={(value) => setEditDomainForm({ ...editDomainForm, expiryDate: value })}
                  />
                  <div className="flex items-center gap-3 mt-2 mb-2">
                    <label className="flex items-center gap-1 cursor-pointer text-xs">
                      <input
                        type="radio"
                        name="extendFrom"
                        checked={!extendFromToday}
                        onChange={() => setExtendFromToday(false)}
                        className="w-3 h-3 text-primary-600"
                      />
                      <span className="text-gray-600 dark:text-gray-400">{t('common.fromExpiryDate')}</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer text-xs">
                      <input
                        type="radio"
                        name="extendFrom"
                        checked={extendFromToday}
                        onChange={() => setExtendFromToday(true)}
                        className="w-3 h-3 text-primary-600"
                      />
                      <span className="text-gray-600 dark:text-gray-400">{t('common.fromToday')}</span>
                    </label>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setEditDomainForm({
                        ...editDomainForm,
                        expiryDate: calculateExpiryDate(extendFromToday ? getTodayDate() : editDomainForm.expiryDate || getTodayDate(), 1)
                      })}
                      className="btn btn-secondary text-xs py-1 px-2"
                    >
                      +1y
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDomainForm({
                        ...editDomainForm,
                        expiryDate: calculateExpiryDate(extendFromToday ? getTodayDate() : editDomainForm.expiryDate || getTodayDate(), 2)
                      })}
                      className="btn btn-secondary text-xs py-1 px-2"
                    >
                      +2y
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDomainForm({
                        ...editDomainForm,
                        expiryDate: calculateExpiryDate(extendFromToday ? getTodayDate() : editDomainForm.expiryDate || getTodayDate(), 3)
                      })}
                      className="btn btn-secondary text-xs py-1 px-2"
                    >
                      +3y
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDomainForm({
                        ...editDomainForm,
                        expiryDate: calculateExpiryDate(extendFromToday ? getTodayDate() : editDomainForm.expiryDate || getTodayDate(), 100)
                      })}
                      className="btn btn-secondary text-xs py-1 px-2"
                    >
                      Unlim.
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="pt-3 border-t dark:border-gray-700">
            <label className="text-xs text-gray-500">{t('common.notes')}</label>
            <textarea
              value={editDomainForm.notes}
              onChange={(e) => setEditDomainForm({ ...editDomainForm, notes: e.target.value })}
              className="input py-1.5 text-sm"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setEditDomainModalOpen(false);
                setEditingDomain(null);
              }}
              className="btn btn-secondary py-1.5 px-3 text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary py-1.5 px-3 text-sm"
              disabled={editDomainMutation.isPending}
            >
              {editDomainMutation.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Hosting Modal */}
      <Modal
        isOpen={editHostingModalOpen}
        onClose={() => {
          setEditHostingModalOpen(false);
          setEditingHosting(null);
        }}
        title={`${t('domains.editHosting')}: ${editingHosting?.packageName || ''}`}
        size="lg"
      >
        <form onSubmit={handleEditHostingSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500">{t('common.package')} *</label>
              <select
                value={editHostingForm.packageId}
                onChange={(e) => setEditHostingForm({ ...editHostingForm, packageId: e.target.value })}
                className="input py-1.5 text-sm"
                required
              >
                <option value="">{t('common.noPackage')}</option>
                {packagesData?.packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} ({pkg.maxMailboxes} {t('common.mailboxes')}, {pkg.storageGb} GB)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('common.mailServer')}</label>
              <div className="py-1.5 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded px-2">
                {packagesData?.packages.find(p => p.id === Number(editHostingForm.packageId))?.mailServerName || '-'}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('common.mailSecurity')}</label>
              <div className="py-1.5 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded px-2">
                {packagesData?.packages.find(p => p.id === Number(editHostingForm.packageId))?.mailSecurityName || '-'}
              </div>
            </div>
          </div>

          {/* Dates & Extend */}
          <div className="pt-3 border-t dark:border-gray-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Left: Added and Expiry Date (read-only) */}
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">{t('common.added')}</span>
                  <div className="mt-1 py-2 px-3 bg-gray-100 dark:bg-gray-800 rounded text-sm font-medium">
                    {formatDateDisplay(editHostingForm.startDate) || '-'}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">{t('common.expiry')}</span>
                  <div className="mt-1 py-2 px-3 bg-gray-100 dark:bg-gray-800 rounded text-sm font-medium">
                    {formatDateDisplay(originalHostingExpiryDate) || '-'}
                  </div>
                </div>
              </div>

              {/* Right: Extend To Date */}
              <div className="bg-primary-50 dark:bg-gray-700/50 rounded-lg p-3 -m-1">
                <span className="text-xs font-medium text-primary-700 dark:text-primary-300 uppercase">{t('common.extendTo')}</span>
                <div className="mt-2">
                  <DateInput
                    name="editHostingExpiryDate"
                    value={editHostingForm.expiryDate}
                    onChange={(value) => setEditHostingForm({ ...editHostingForm, expiryDate: value })}
                  />
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {periodButtons.map((btn) => (
                      <button
                        key={btn.years}
                        type="button"
                        onClick={() => setEditHostingForm({
                          ...editHostingForm,
                          expiryDate: calculateExpiryDate(originalHostingExpiryDate || getTodayDate(), btn.years)
                        })}
                        className="btn btn-secondary text-xs py-1 px-2"
                      >
                        {'labelKey' in btn ? t(btn.labelKey as string) : btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t dark:border-gray-700">
            <label className="text-xs text-gray-500">{t('common.notes')}</label>
            <textarea
              value={editHostingForm.notes}
              onChange={(e) => setEditHostingForm({ ...editHostingForm, notes: e.target.value })}
              className="input py-1.5 text-sm"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setEditHostingModalOpen(false);
                setEditingHosting(null);
              }}
              className="btn btn-secondary py-1.5 px-3 text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary py-1.5 px-3 text-sm"
              disabled={editHostingMutation.isPending}
            >
              {editHostingMutation.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
