import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Domain, Hosting, Package, Client, ExpiryStatus, MailServer, MailSecurity, ExtendPeriod } from '../types';
import DateInput from '../components/common/DateInput';
import Modal from '../components/common/Modal';
import { ArrowLeft, Globe, Package as PackageIcon, ChevronDown, ChevronRight, Pencil, Lock, Unlock, Server, Shield, FileText, Upload, Download, Trash2, AlertTriangle, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

interface DomainWithDetails extends Domain {
  clientName?: string | null;
}

interface HostingWithDetails extends Hosting {
  daysUntilExpiry: number;
  expiryStatus?: ExpiryStatus;
  packageName?: string | null;
}

const periodButtons = [
  { years: 1, label: '+1' },
  { years: 2, label: '+2' },
  { years: 3, label: '+3' },
  { years: 100, labelKey: 'common.periodShortUnlimited' },
];

// Format date for display: YYYY-MM-DD -> DD.MM.YYYY
function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '-';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}.${month}.${year}`;
}

function getTodayDate(): string {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

function calculateExpiryDate(fromDate: string, yearsToAdd: number): string {
  const date = new Date(fromDate);
  date.setFullYear(date.getFullYear() + yearsToAdd);
  return date.toISOString().split('T')[0];
}

const statusColors: Record<ExpiryStatus, { text: string; dot: string }> = {
  green: { text: 'text-green-600 dark:text-green-400', dot: 'bg-green-500' },
  yellow: { text: 'text-yellow-600 dark:text-yellow-400', dot: 'bg-yellow-500' },
  orange: { text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  red: { text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  forDeletion: { text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
  deleted: { text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-500' },
};

function StatusBadge({ status, days }: { status: ExpiryStatus; days: number }) {
  const { t } = useTranslation();
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
}

export default function DomainDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isDomainExpanded, setIsDomainExpanded] = useState(true);
  const [isDomainLocked, setIsDomainLocked] = useState(true);
  const [sameAsPrimaryContact, setSameAsPrimaryContact] = useState(true);
  const [sameAsTechContact, setSameAsTechContact] = useState(true);
  const [originalExpiryDate, setOriginalExpiryDate] = useState('');
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [selectedExtendPeriod, setSelectedExtendPeriod] = useState<ExtendPeriod | ''>('');
  const [extendFromToday, setExtendFromToday] = useState(false);

  const extendOptions: { value: ExtendPeriod; label: string }[] = [
    { value: '1year', label: t('common.period1Year') },
    { value: '2years', label: t('common.period2Years') },
    { value: '3years', label: t('common.period3Years') },
    { value: 'unlimited', label: t('common.periodUnlimited') },
  ];

  const [domainForm, setDomainForm] = useState({
    domainName: '',
    clientId: '' as number | '',
    primaryName: '',
    primaryPhone: '',
    primaryEmail: '',
    techName: '',
    techPhone: '',
    techEmail: '',
    notes: '',
  });

  const [hostingForm, setHostingForm] = useState({
    packageId: '' as number | '',
    expiryDate: '',
  });

  // Fetch domain details
  const { data: domainData, isLoading: domainLoading } = useQuery({
    queryKey: ['domain', id],
    queryFn: () => api.get<{ domain: DomainWithDetails }>(`/api/domains/${id}`),
    enabled: !!id,
  });

  // Fetch hosting for this domain
  const { data: hostingData } = useQuery({
    queryKey: ['domain-hosting', id],
    queryFn: async () => {
      const response = await api.get<{ hosting: HostingWithDetails[] }>('/api/hosting');
      const domainHosting = response.hosting.find(h => h.domainId === Number(id) && h.id !== null);
      return domainHosting || null;
    },
    enabled: !!id,
  });

  // Fetch clients for dropdown
  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ clients: Client[] }>('/api/clients'),
  });

  // Fetch packages for dropdown
  const { data: packagesData } = useQuery({
    queryKey: ['packages'],
    queryFn: () => api.get<{ packages: Package[] }>('/api/packages'),
  });

  // Fetch mail servers
  useQuery({
    queryKey: ['mail-servers'],
    queryFn: () => api.get<{ mailServers: MailServer[] }>('/api/mail-servers'),
  });

  // Fetch mail security
  useQuery({
    queryKey: ['mail-security'],
    queryFn: () => api.get<{ mailSecurity: MailSecurity[] }>('/api/mail-security'),
  });

  const domain = domainData?.domain;
  const hosting = hostingData;
  const clients = clientsData?.clients || [];
  const packages = packagesData?.packages || [];

  // Get selected client data
  const selectedClient = clients.find(c => c.id === (domainForm.clientId || domain?.clientId));

  // Get selected package data
  const selectedPackage = packages.find(p => p.id === Number(hostingForm.packageId || hosting?.packageId));

  // Update domain mutation
  const updateDomainMutation = useMutation({
    mutationFn: (data: Partial<Domain>) => api.put(`/api/domains/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domain', id] });
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      toast.success(t('domains.domainUpdated'));
      setIsDomainLocked(true);
    },
    onError: () => toast.error(t('domains.errorUpdatingDomain')),
  });

  // Update hosting mutation
  const updateHostingMutation = useMutation({
    mutationFn: (data: Partial<Hosting>) => {
      if (hosting) {
        return api.put(`/api/hosting/${hosting.id}`, data);
      } else {
        return api.post('/api/hosting', {
          ...data,
          domainId: Number(id),
          clientId: domainForm.clientId || domain?.clientId,
          startDate: getTodayDate(),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domain-hosting', id] });
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      toast.success(hosting ? t('domains.hostingUpdated') : t('domains.hostingCreated'));
    },
    onError: () => toast.error(t('domains.errorUpdatingHosting')),
  });

  // PDF mutations
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const uploadPdfMutation = useMutation({
    mutationFn: (file: File) => api.uploadFile<{ pdfFilename: string }>(`/api/domains/${id}/pdf`, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domain', id] });
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success(t('domains.pdfUploaded'));
    },
    onError: (err: Error) => toast.error(err.message || t('domains.errorUploadingPdf')),
  });

  const deletePdfMutation = useMutation({
    mutationFn: () => api.delete(`/api/domains/${id}/pdf`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domain', id] });
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success(t('domains.pdfDeleted'));
    },
    onError: () => toast.error(t('domains.errorDeletingPdf')),
  });

  const extendMutation = useMutation({
    mutationFn: ({ hostingId, period, fromToday }: { hostingId: number; period: ExtendPeriod; fromToday?: boolean }) =>
      api.post(`/api/hosting/${hostingId}/extend`, { period, fromToday }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domain-hosting', id] });
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      toast.success(t('common.saved'));
      setExtendModalOpen(false);
      setSelectedExtendPeriod('');
      setExtendFromToday(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const expireNowMutation = useMutation({
    mutationFn: (hostingId: number) => api.post(`/api/hosting/${hostingId}/expire-now`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domain-hosting', id] });
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      toast.success(t('common.saved'));
      setExtendModalOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error(t('domains.onlyPdfAllowed'));
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('domains.fileTooLarge'));
      e.target.value = '';
      return;
    }

    uploadPdfMutation.mutate(file);
    e.target.value = '';
  };

  const handleUnlock = () => {
    if (!domain) return;
    setDomainForm({
      domainName: domain.domainName || '',
      clientId: domain.clientId || '',
      primaryName: domain.primaryContactName || '',
      primaryPhone: domain.primaryContactPhone || '',
      primaryEmail: domain.primaryContactEmail || '',
      techName: domain.contactEmail1 || '',
      techPhone: domain.contactEmail2 || '',
      techEmail: domain.contactEmail3 || '',
      notes: domain.notes || '',
    });
    setHostingForm({
      packageId: hosting?.packageId || '',
      expiryDate: hosting?.expiryDate || '',
    });
    setOriginalExpiryDate(hosting?.expiryDate || '');
    // Check if primary contact matches client's primary contact
    if (selectedClient) {
      const clientPrimaryName = selectedClient.contactPerson || '';
      const clientPrimaryPhone = selectedClient.phone || '';
      const clientPrimaryEmail = selectedClient.email1 || '';
      setSameAsPrimaryContact(
        (domain.primaryContactName || '') === clientPrimaryName &&
        (domain.primaryContactPhone || '') === clientPrimaryPhone &&
        (domain.primaryContactEmail || '') === clientPrimaryEmail
      );
      const clientTechName = selectedClient.techContact || selectedClient.contactPerson || '';
      const clientTechPhone = selectedClient.techPhone || selectedClient.phone || '';
      const clientTechEmail = selectedClient.techEmail || selectedClient.email1 || '';
      setSameAsTechContact(
        (domain.contactEmail1 || '') === clientTechName &&
        (domain.contactEmail2 || '') === clientTechPhone &&
        (domain.contactEmail3 || '') === clientTechEmail
      );
    }
    setIsDomainLocked(false);
  };

  const handleSave = () => {
    // Save domain
    updateDomainMutation.mutate({
      domainName: domainForm.domainName,
      clientId: domainForm.clientId || null,
      primaryContactName: domainForm.primaryName || null,
      primaryContactPhone: domainForm.primaryPhone || null,
      primaryContactEmail: domainForm.primaryEmail || null,
      contactEmail1: domainForm.techName || null,
      contactEmail2: domainForm.techPhone || null,
      contactEmail3: domainForm.techEmail || null,
      notes: domainForm.notes || null,
    });

    // Save hosting if package and expiry are set
    if (hostingForm.packageId && hostingForm.expiryDate) {
      updateHostingMutation.mutate({
        packageId: Number(hostingForm.packageId),
        expiryDate: hostingForm.expiryDate,
      });
    }
  };

  const handleSameAsPrimaryToggle = (checked: boolean) => {
    setSameAsPrimaryContact(checked);
    if (checked && selectedClient) {
      setDomainForm(prev => ({
        ...prev,
        primaryName: selectedClient.contactPerson || '',
        primaryPhone: selectedClient.phone || '',
        primaryEmail: selectedClient.email1 || '',
      }));
    }
  };

  const handleSameAsTechToggle = (checked: boolean) => {
    setSameAsTechContact(checked);
    if (checked && selectedClient) {
      setDomainForm(prev => ({
        ...prev,
        techName: selectedClient.techContact || selectedClient.contactPerson || '',
        techPhone: selectedClient.techPhone || selectedClient.phone || '',
        techEmail: selectedClient.techEmail || selectedClient.email1 || '',
      }));
    }
  };

  const handleClientChange = (clientId: number | '') => {
    setDomainForm(prev => ({ ...prev, clientId }));
    const client = clientId ? clients.find(c => c.id === clientId) : null;
    if (client) {
      if (sameAsPrimaryContact) {
        setDomainForm(prev => ({
          ...prev,
          clientId,
          primaryName: client.contactPerson || '',
          primaryPhone: client.phone || '',
          primaryEmail: client.email1 || '',
        }));
      }
      if (sameAsTechContact) {
        setDomainForm(prev => ({
          ...prev,
          clientId,
          techName: client.techContact || client.contactPerson || '',
          techPhone: client.techPhone || client.phone || '',
          techEmail: client.techEmail || client.email1 || '',
        }));
      }
    }
  };

  const getExpiryStatus = (days: number): ExpiryStatus => {
    if (days <= 0) return 'red';
    if (days <= 7) return 'orange';
    if (days <= 31) return 'yellow';
    return 'green';
  };

  if (domainLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">{t('domains.domainNotFound')}</p>
        <button onClick={() => navigate('/domains')} className="btn btn-primary mt-4">
          {t('domains.backToDomains')}
        </button>
      </div>
    );
  }

  const primaryName = domain.primaryContactName || selectedClient?.contactPerson || '-';
  const primaryPhone = domain.primaryContactPhone || selectedClient?.phone || '-';
  const primaryEmail = domain.primaryContactEmail || selectedClient?.email1 || '-';
  const techName = domain.contactEmail1 || selectedClient?.techContact || selectedClient?.contactPerson || '-';
  const techPhone = domain.contactEmail2 || selectedClient?.techPhone || selectedClient?.phone || '-';
  const techEmail = domain.contactEmail3 || selectedClient?.techEmail || selectedClient?.email1 || '-';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/domains')}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {domain.domainName}
        </h1>
      </div>

      {/* Domain Section */}
      <div className="card card-flush overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center">
            <Globe className="w-4 h-4 mr-2 text-primary-600" />
            <h2 className="text-base font-semibold">{t('common.domain')}</h2>
          </div>
        </div>

        {/* Domain Row - Collapsible */}
        <div className="border-t dark:border-gray-700">
          {/* Domain Header */}
          <div
            onClick={() => setIsDomainExpanded(!isDomainExpanded)}
            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isDomainExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
              <Globe className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
              <span className="font-medium text-sm flex-shrink-0">{domain.domainName}</span>
              <span className="text-gray-400 mx-1 flex-shrink-0">|</span>
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                <span className="text-gray-500 font-medium">{t('common.primary')}</span> {primaryName}, {primaryPhone}, {primaryEmail}
              </span>
              <span className="text-gray-400 mx-1 flex-shrink-0">|</span>
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                <span className="text-gray-500 font-medium">{t('common.technical')}</span> {techName}, {techPhone}, {techEmail}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {hosting && (
                <StatusBadge status={getExpiryStatus(hosting.daysUntilExpiry)} days={hosting.daysUntilExpiry} />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isDomainLocked) {
                    handleUnlock();
                    setIsDomainExpanded(true);
                  } else {
                    handleSave();
                  }
                }}
                className="btn btn-secondary btn-sm flex items-center gap-1"
              >
                {isDomainLocked ? (
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
              {!isDomainLocked && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDomainLocked(true);
                  }}
                  className="btn btn-secondary btn-sm flex items-center gap-1"
                >
                  <Unlock className="w-3 h-3" />
                  {t('common.cancel')}
                </button>
              )}
            </div>
          </div>

          {/* Domain Details (Expanded) */}
          {isDomainExpanded && (
            <div className="border-t dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50 space-y-3">
              {/* Domain Name & Client */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('domains.domainName')}</span>
                  {isDomainLocked ? (
                    <div className="mt-1 font-medium text-sm">{domain.domainName}</div>
                  ) : (
                    <input
                      type="text"
                      value={domainForm.domainName}
                      onChange={(e) => setDomainForm({ ...domainForm, domainName: e.target.value })}
                      className="input input-sm mt-1"
                    />
                  )}
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('domains.client')}</span>
                  {isDomainLocked ? (
                    <div className="mt-1 font-medium text-sm">{domain.clientName || t('domains.noClientAssigned')}</div>
                  ) : (
                    <select
                      value={domainForm.clientId}
                      onChange={(e) => handleClientChange(e.target.value ? Number(e.target.value) : '')}
                      className="input input-sm mt-1"
                    >
                      <option value="">{t('common.noClient')}</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Primary Contact */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.primaryContact')}</span>
                  {!isDomainLocked && (
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sameAsPrimaryContact}
                        onChange={(e) => handleSameAsPrimaryToggle(e.target.checked)}
                        className="w-3 h-3 rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-gray-500">{t('common.sameAsCompanyPrimary')}</span>
                    </label>
                  )}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{t('common.nameAndSurname')}</label>
                    {isDomainLocked ? (
                      <div className="text-sm">{primaryName}</div>
                    ) : (
                      <input
                        type="text"
                        value={domainForm.primaryName}
                        onChange={(e) => setDomainForm({ ...domainForm, primaryName: e.target.value })}
                        className="input input-sm"
                        disabled={sameAsPrimaryContact}
                        required
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{t('common.phone')}</label>
                    {isDomainLocked ? (
                      <div className="text-sm">{primaryPhone}</div>
                    ) : (
                      <input
                        type="text"
                        value={domainForm.primaryPhone}
                        onChange={(e) => setDomainForm({ ...domainForm, primaryPhone: e.target.value })}
                        className="input input-sm"
                        disabled={sameAsPrimaryContact}
                        required
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{t('common.email')}</label>
                    {isDomainLocked ? (
                      <div className="text-sm">{primaryEmail}</div>
                    ) : (
                      <input
                        type="email"
                        value={domainForm.primaryEmail}
                        onChange={(e) => setDomainForm({ ...domainForm, primaryEmail: e.target.value })}
                        className="input input-sm"
                        disabled={sameAsPrimaryContact}
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
                  {!isDomainLocked && (
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sameAsTechContact}
                        onChange={(e) => handleSameAsTechToggle(e.target.checked)}
                        className="w-3 h-3 rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-gray-500">{t('common.sameAsCompanyTechnical')}</span>
                    </label>
                  )}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{t('common.nameAndSurname')}</label>
                    {isDomainLocked ? (
                      <div className="text-sm">{techName}</div>
                    ) : (
                      <input
                        type="text"
                        value={domainForm.techName}
                        onChange={(e) => setDomainForm({ ...domainForm, techName: e.target.value })}
                        className="input input-sm"
                        disabled={sameAsTechContact}
                        required
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{t('common.phone')}</label>
                    {isDomainLocked ? (
                      <div className="text-sm">{techPhone}</div>
                    ) : (
                      <input
                        type="text"
                        value={domainForm.techPhone}
                        onChange={(e) => setDomainForm({ ...domainForm, techPhone: e.target.value })}
                        className="input input-sm"
                        disabled={sameAsTechContact}
                        required
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{t('common.email')}</label>
                    {isDomainLocked ? (
                      <div className="text-sm">{techEmail}</div>
                    ) : (
                      <input
                        type="email"
                        value={domainForm.techEmail}
                        onChange={(e) => setDomainForm({ ...domainForm, techEmail: e.target.value })}
                        className="input input-sm"
                        disabled={sameAsTechContact}
                        required
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Hosting Package */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                {/* Package header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <PackageIcon className="w-3.5 h-3.5 text-primary-600" />
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.package')}</span>
                    {isDomainLocked ? (
                      <span className="font-medium text-sm">{hosting?.packageName || t('common.noPackage')}</span>
                    ) : (
                      <select
                        value={hostingForm.packageId}
                        onChange={(e) => setHostingForm({ ...hostingForm, packageId: e.target.value ? Number(e.target.value) : '' })}
                        className="input input-sm"
                      >
                        <option value="">{t('common.noPackage')}</option>
                        {packages.map((pkg) => (
                          <option key={pkg.id} value={pkg.id}>
                            {pkg.name} {pkg.mailServerName ? `(${pkg.mailServerName})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {isDomainLocked && hosting && (
                    <StatusBadge status={getExpiryStatus(hosting.daysUntilExpiry)} days={hosting.daysUntilExpiry} />
                  )}
                </div>

                {/* Package details row */}
                {selectedPackage && (
                  <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t dark:border-gray-700 text-xs flex-wrap">
                    {selectedPackage.description && (
                      <span className="text-gray-500">{selectedPackage.description}</span>
                    )}
                    <span className="text-gray-600 dark:text-gray-400">{selectedPackage.maxMailboxes} {t('common.mailboxes')}</span>
                    <span className="text-gray-600 dark:text-gray-400">{selectedPackage.storageGb} GB</span>
                    <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                      <Server className="w-3 h-3" />
                      <span className="text-gray-500 font-medium">{t('common.mailServer')}</span>
                      <span>{selectedPackage.mailServerName || '-'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                      <Shield className="w-3 h-3" />
                      <span className="text-gray-500 font-medium">{t('common.mailSecurity')}</span>
                      <span>{selectedPackage.mailSecurityName || '-'}</span>
                    </div>
                  </div>
                )}

                {/* Dates row */}
                {(hosting || !isDomainLocked) && (
                  <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t dark:border-gray-700 text-xs flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">{t('common.added')}</span>
                      <span className="font-medium">{formatDateDisplay(hosting?.startDate || getTodayDate())}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">{t('common.expiry')}</span>
                      <span className="font-medium">{formatDateDisplay(originalExpiryDate || hosting?.expiryDate || '')}</span>
                    </div>
                    {!isDomainLocked && (
                      <div className="flex items-center gap-1.5 ml-auto bg-primary-50 dark:bg-primary-900/20 rounded px-2 py-1">
                        <span className="text-[11px] font-medium text-primary-700 dark:text-primary-300">{t('common.extendTo')}</span>
                        <DateInput
                          value={hostingForm.expiryDate}
                          onChange={(value) => setHostingForm({ ...hostingForm, expiryDate: value })}
                          size="sm"
                          className="w-32"
                        />
                        {periodButtons.map((btn) => (
                          <button
                            key={btn.years}
                            type="button"
                            onClick={() => setHostingForm({
                              ...hostingForm,
                              expiryDate: calculateExpiryDate(originalExpiryDate || hosting?.expiryDate || getTodayDate(), btn.years)
                            })}
                            className="btn btn-secondary btn-xs"
                          >
                            {'labelKey' in btn ? t(btn.labelKey as string) : btn.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {hosting && isDomainLocked && (
                      <button
                        type="button"
                        onClick={() => setExtendModalOpen(true)}
                        className="btn btn-primary btn-sm flex items-center gap-1 ml-auto"
                      >
                        <Calendar className="w-3 h-3" />
                        {t('common.extend')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* PDF Document */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-primary-600" />
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('domains.pdfDocument')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {domain.pdfFilename ? (
                      <>
                        <span className="text-xs text-gray-600 dark:text-gray-400">{domain.pdfFilename}</span>
                        <button
                          onClick={() => api.download(`/api/domains/${id}/pdf`, domain.pdfFilename!)}
                          className="p-1 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
                          title={t('common.download')}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deletePdfMutation.mutate()}
                          className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title={t('common.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">{t('domains.noPdf')}</span>
                    )}
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handlePdfUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => pdfInputRef.current?.click()}
                      className="btn btn-secondary btn-xs flex items-center gap-1"
                    >
                      <Upload className="w-3 h-3" />
                      {t('domains.uploadPdf')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.notes')}</span>
                {isDomainLocked ? (
                  <div className="mt-1 text-sm">{domain.notes || '-'}</div>
                ) : (
                  <textarea
                    value={domainForm.notes}
                    onChange={(e) => setDomainForm({ ...domainForm, notes: e.target.value })}
                    className="input input-sm mt-1"
                    rows={2}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Extend Modal */}
      <Modal
        isOpen={extendModalOpen}
        onClose={() => {
          setExtendModalOpen(false);
          setSelectedExtendPeriod('');
          setExtendFromToday(false);
        }}
        title={`${t('common.extend')}: ${domain.domainName}`}
        size="sm"
      >
        <div className="space-y-4">
          {/* From Today / From Expiry Date */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="extendFrom"
                checked={!extendFromToday}
                onChange={() => setExtendFromToday(false)}
                className="w-4 h-4 text-primary-600"
              />
              <span className="text-gray-700 dark:text-gray-300">{t('common.fromExpiryDate')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="extendFrom"
                checked={extendFromToday}
                onChange={() => setExtendFromToday(true)}
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
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
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
                <span className="font-medium">{option.label}</span>
              </label>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex justify-between items-center pt-3 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                if (hosting?.id) {
                  expireNowMutation.mutate(hosting.id);
                }
              }}
              disabled={expireNowMutation.isPending}
              className="btn btn-sm flex items-center gap-1 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150"
            >
              <AlertTriangle className="w-3 h-3" />
              {expireNowMutation.isPending ? t('common.saving') : t('common.expireNow')}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setExtendModalOpen(false);
                  setSelectedExtendPeriod('');
                  setExtendFromToday(false);
                }}
                className="btn btn-secondary py-1.5 px-3 text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedExtendPeriod && hosting?.id) {
                    extendMutation.mutate({
                      hostingId: hosting.id,
                      period: selectedExtendPeriod,
                      fromToday: extendFromToday,
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
    </div>
  );
}
