import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Hosting, ExpiryStatus, Client, Domain, Package, ExtendPeriod } from '../types';
import Modal from '../components/common/Modal';
import DateInput from '../components/common/DateInput';
import { Search, Filter, Plus, Globe, Loader2, Pencil, Trash2, LayoutList, LayoutGrid, Server, Shield, Calendar, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useAuth } from '../context/AuthContext';

type FilterStatus = ExpiryStatus | 'noPackage';
const ALL_STATUSES: ExpiryStatus[] = ['green', 'yellow', 'orange', 'red', 'forDeletion', 'deleted'];

interface HostingWithDetails extends Hosting {
  daysUntilExpiry: number | null;
  expiryStatus?: ExpiryStatus;
  isActive?: boolean;
  isEnabled?: boolean;
  clientContactPerson?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientTechContact?: string | null;
  clientTechPhone?: string | null;
  clientTechEmail?: string | null;
  domainPrimaryName?: string | null;
  domainPrimaryPhone?: string | null;
  domainPrimaryEmail?: string | null;
  domainTechName?: string | null;
  domainTechPhone?: string | null;
  domainTechEmail?: string | null;
  domainIsActive?: boolean;
  packageDescription?: string | null;
  packageMaxMailboxes?: number | null;
  packageStorageGb?: number | null;
  packagePrice?: number | null;
  mailServerName?: string | null;
  mailSecurityName?: string | null;
}

const statusColors: Record<ExpiryStatus, { border: string; bg: string; text: string; labelKey: string; dot: string }> = {
  green: { border: 'border-green-500', bg: 'bg-green-500/20', text: 'text-green-600 dark:text-green-400', labelKey: 'common.statusOk', dot: 'bg-green-500' },
  yellow: { border: 'border-yellow-500', bg: 'bg-yellow-500/20', text: 'text-yellow-600 dark:text-yellow-400', labelKey: 'common.statusWarning', dot: 'bg-yellow-500' },
  orange: { border: 'border-orange-500', bg: 'bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400', labelKey: 'common.statusCritical', dot: 'bg-orange-500' },
  red: { border: 'border-red-500', bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400', labelKey: 'common.statusExpired', dot: 'bg-red-500' },
  forDeletion: { border: 'border-purple-500', bg: 'bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400', labelKey: 'common.statusForDeletion', dot: 'bg-purple-500' },
  deleted: { border: 'border-gray-500', bg: 'bg-gray-500/20', text: 'text-gray-600 dark:text-gray-400', labelKey: 'common.statusDeleted', dot: 'bg-gray-500' },
};

const periodButtons = [
  { years: 1, label: '+1' },
  { years: 2, label: '+2' },
  { years: 3, label: '+3' },
  { years: 100, labelKey: 'common.periodShortUnlimited' },
];

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function calculateExpiryDate(fromDate: string, yearsToAdd: number): string {
  const date = new Date(fromDate || getTodayDate());
  date.setFullYear(date.getFullYear() + yearsToAdd);
  return date.toISOString().split('T')[0];
}

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

type ViewMode = 'list' | 'cards';

export default function HostingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<{ domainId: number; domainName: string } | null>(null);
  const [statusFilters, setStatusFilters] = useState<Set<FilterStatus>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [addDomainModalOpen, setAddDomainModalOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | ''>('');
  const [sameAsPrimary, setSameAsPrimary] = useState(true);
  const [sameAsTech, setSameAsTech] = useState(true);
  const [selectedPackageId, setSelectedPackageId] = useState<number | ''>('');
  const [domainForm, setDomainForm] = useState({
    domainName: '',
    primaryName: '',
    primaryPhone: '',
    primaryEmail: '',
    techName: '',
    techPhone: '',
    techEmail: '',
    notes: '',
    expiryDate: '',
  });

  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendItem, setExtendItem] = useState<{ id: number; name: string } | null>(null);
  const [selectedExtendPeriod, setSelectedExtendPeriod] = useState<ExtendPeriod | ''>('');
  const [extendFromToday, setExtendFromToday] = useState(false);

  const extendOptions: { value: ExtendPeriod; label: string }[] = [
    { value: '1year', label: t('common.period1Year') },
    { value: '2years', label: t('common.period2Years') },
    { value: '3years', label: t('common.period3Years') },
    { value: 'unlimited', label: t('common.periodUnlimited') },
  ];

  const statusLabels: Record<ExpiryStatus, string> = {
    green: t('status.ok'),
    yellow: t('status.warning'),
    orange: t('status.critical'),
    red: t('status.expired'),
    forDeletion: t('status.forDeletion'),
    deleted: t('status.deleted'),
  };

  // Open modal if ?add=true
  const urlAddParam = searchParams.get('add');
  useEffect(() => {
    if (urlAddParam === 'true') {
      setAddDomainModalOpen(true);
      // Remove add param but keep filter if present
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('add');
      setSearchParams(newParams, { replace: true });
    }
  }, [urlAddParam, searchParams, setSearchParams]);

  // Sync filters from URL - only run when URL filter param actually changes externally
  const urlFilterParam = searchParams.get('filter');
  const allValidFilters: FilterStatus[] = [...ALL_STATUSES, 'noPackage'];
  useEffect(() => {
    if (urlFilterParam) {
      const filters = urlFilterParam.split(',').filter(f => allValidFilters.includes(f as FilterStatus)) as FilterStatus[];
      setStatusFilters(new Set(filters));
    } else {
      setStatusFilters(new Set());
    }
  }, [urlFilterParam]);

  // Toggle a status filter
  const toggleStatusFilter = (status: FilterStatus) => {
    const newSet = new Set(statusFilters);
    if (newSet.has(status)) {
      newSet.delete(status);
    } else {
      newSet.add(status);
    }
    // Update URL (this will trigger the effect above)
    if (newSet.size > 0) {
      setSearchParams({ filter: Array.from(newSet).join(',') }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  // Clear all filters (All button)
  const clearAllFilters = () => {
    setSearchParams({}, { replace: true });
  };

  const { data: hostingData, isLoading } = useQuery({
    queryKey: ['hosting'],
    queryFn: () => api.get<{ hosting: HostingWithDetails[] }>('/api/hosting'),
  });

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ clients: Client[] }>('/api/clients'),
  });

  const { data: packagesData } = useQuery({
    queryKey: ['packages'],
    queryFn: () => api.get<{ packages: Package[] }>('/api/packages'),
  });

  const createDomainMutation = useMutation({
    mutationFn: async (data: { domain: Partial<Domain>; hosting?: { packageId: number; expiryDate: string; clientId: number } }) => {
      const domainRes = await api.post<{ domain: Domain }>('/api/domains', data.domain);
      if (data.hosting && domainRes.domain?.id) {
        await api.post('/api/hosting', {
          domainId: domainRes.domain.id,
          clientId: data.hosting.clientId,
          packageId: data.hosting.packageId,
          expiryDate: data.hosting.expiryDate,
          startDate: new Date().toISOString().split('T')[0],
        });
      }
      return domainRes;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success(t('domains.domainCreated'));
      setAddDomainModalOpen(false);
      resetDomainForm();
    },
    onError: () => toast.error(t('domains.errorCreatingDomain')),
  });

  const deleteDomainMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/domains/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success(t('domains.domainDeleted'));
      setDeleteDialogOpen(false);
      setDomainToDelete(null);
    },
    onError: () => toast.error(t('common.errorDeleting')),
  });

  const extendMutation = useMutation({
    mutationFn: ({ hostingId, period, fromToday }: { hostingId: number; period: ExtendPeriod; fromToday?: boolean }) =>
      api.post(`/api/hosting/${hostingId}/extend`, { period, fromToday }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      toast.success(t('common.saved'));
      setExtendModalOpen(false);
      setExtendItem(null);
      setSelectedExtendPeriod('');
      setExtendFromToday(false);
    },
    onError: (error: Error) => toast.error(error.message || t('common.errorSaving')),
  });

  const expireNowMutation = useMutation({
    mutationFn: (hostingId: number) => api.post(`/api/hosting/${hostingId}/expire-now`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      toast.success(t('common.saved'));
      setExtendModalOpen(false);
      setExtendItem(null);
      setSelectedExtendPeriod('');
    },
    onError: (error: Error) => toast.error(error.message || t('common.errorSaving')),
  });

  const handleExtend = (hostingId: number, name: string) => {
    setExtendItem({ id: hostingId, name });
    setSelectedExtendPeriod('');
    setExtendFromToday(false);
    setExtendModalOpen(true);
  };

  const resetDomainForm = () => {
    setSelectedClientId('');
    setSameAsPrimary(true);
    setSameAsTech(true);
    setSelectedPackageId('');
    setDomainForm({
      domainName: '',
      primaryName: '',
      primaryPhone: '',
      primaryEmail: '',
      techName: '',
      techPhone: '',
      techEmail: '',
      notes: '',
      expiryDate: '',
    });
  };

  const handleClientChange = (clientId: number | '') => {
    setSelectedClientId(clientId);
    const client = clientId ? clientsData?.clients.find(c => c.id === clientId) : null;
    if (client) {
      const updates: Partial<typeof domainForm> = {};
      if (sameAsPrimary) {
        updates.primaryName = client.contactPerson || '';
        updates.primaryPhone = client.phone || '';
        updates.primaryEmail = client.email1 || '';
      }
      if (sameAsTech) {
        updates.techName = client.techContact || client.contactPerson || '';
        updates.techPhone = client.techPhone || client.phone || '';
        updates.techEmail = client.techEmail || client.email1 || '';
      }
      setDomainForm(prev => ({ ...prev, ...updates }));
    } else {
      setDomainForm(prev => ({
        ...prev,
        primaryName: '', primaryPhone: '', primaryEmail: '',
        techName: '', techPhone: '', techEmail: '',
      }));
    }
  };

  const handleSameAsPrimaryToggle = (checked: boolean) => {
    setSameAsPrimary(checked);
    if (checked && selectedClientId) {
      const client = clientsData?.clients.find(c => c.id === selectedClientId);
      if (client) {
        setDomainForm(prev => ({
          ...prev,
          primaryName: client.contactPerson || '',
          primaryPhone: client.phone || '',
          primaryEmail: client.email1 || '',
        }));
      }
    }
  };

  const handleSameAsTechToggle = (checked: boolean) => {
    setSameAsTech(checked);
    if (checked && selectedClientId) {
      const client = clientsData?.clients.find(c => c.id === selectedClientId);
      if (client) {
        setDomainForm(prev => ({
          ...prev,
          techName: client.techContact || client.contactPerson || '',
          techPhone: client.techPhone || client.phone || '',
          techEmail: client.techEmail || client.email1 || '',
        }));
      }
    }
  };

  const handleAddDomainSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const domainData = {
      clientId: selectedClientId || null,
      domainName: domainForm.domainName,
      primaryContactName: domainForm.primaryName || null,
      primaryContactPhone: domainForm.primaryPhone || null,
      primaryContactEmail: domainForm.primaryEmail || null,
      contactEmail1: domainForm.techName || null,
      contactEmail2: domainForm.techPhone || null,
      contactEmail3: domainForm.techEmail || null,
      notes: domainForm.notes || null,
    };

    const hostingData = selectedPackageId && domainForm.expiryDate && selectedClientId
      ? { packageId: Number(selectedPackageId), expiryDate: domainForm.expiryDate, clientId: Number(selectedClientId) }
      : undefined;

    createDomainMutation.mutate({ domain: domainData, hosting: hostingData });
  };

  // Helper to get expiry status from days
  const getExpiryStatus = (days: number): ExpiryStatus => {
    if (days <= -60) return 'deleted';
    if (days <= -30) return 'forDeletion';
    if (days <= 0) return 'red';
    if (days <= 7) return 'orange';
    if (days <= 31) return 'yellow';
    return 'green';
  };

  const filteredHosting = (hostingData?.hosting || []).filter((h) => {
    // Skip hosting records without a domain (orphaned data)
    if (!h.domainId) return false;
    const isUnhosted = h.daysUntilExpiry === null;

    // Status filter (if any filters are selected)
    if (statusFilters.size > 0) {
      if (isUnhosted) {
        if (!statusFilters.has('noPackage')) return false;
      } else {
        const status = getExpiryStatus(h.daysUntilExpiry!);
        if (!statusFilters.has(status)) return false;
      }
    }

    // Search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      return (
        h.domainName?.toLowerCase().includes(search) ||
        h.clientName?.toLowerCase().includes(search) ||
        h.packageName?.toLowerCase().includes(search)
      );
    }
    return true;
  }).sort((a, b) => (a.domainName || '').localeCompare(b.domainName || ''));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('nav.domains')}
      </h1>

      {/* Domains List */}
      <div className="card card-flush overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('common.searchPlaceholder')}
                className="input input-sm w-full pl-8"
              />
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-600 rounded p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                title={t('common.listView')}
              >
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                title={t('common.cardsView')}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>

          <button
            onClick={() => setAddDomainModalOpen(true)}
            className="btn btn-primary btn-sm flex items-center"
          >
            <Plus className="w-3 h-3 mr-1" />
            {t('common.add')}
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={clearAllFilters}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                statusFilters.size === 0
                  ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {t('common.all')}
            </button>
            {ALL_STATUSES.map((status) => (
              <button
                key={status}
                onClick={() => toggleStatusFilter(status)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                  statusFilters.has(status)
                    ? `${statusColors[status].bg} ${statusColors[status].text} ring-2 ring-offset-1 dark:ring-offset-gray-800`
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
                style={statusFilters.has(status) ? { '--tw-ring-color': status === 'green' ? '#22c55e' : status === 'yellow' ? '#eab308' : status === 'orange' ? '#f97316' : status === 'red' ? '#ef4444' : status === 'forDeletion' ? '#a855f7' : '#6b7280' } as React.CSSProperties : undefined}
              >
                <span className={`w-2 h-2 rounded-full ${statusColors[status].dot}`}></span>
                {statusLabels[status]}
              </button>
            ))}
            <button
              onClick={() => toggleStatusFilter('noPackage')}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                statusFilters.has('noPackage')
                  ? 'bg-gray-500/20 text-gray-600 dark:text-gray-400 ring-2 ring-offset-1 dark:ring-offset-gray-800'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              style={statusFilters.has('noPackage') ? { '--tw-ring-color': '#6b7280' } as React.CSSProperties : undefined}
            >
              <span className="w-2 h-2 rounded-full bg-gray-400"></span>
              {t('common.statusNoPackage')}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
          </div>
        ) : filteredHosting.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500">
            {searchTerm ? t('common.noResults') : t('domains.noDomains')}
          </div>
        ) : viewMode === 'cards' ? (
          /* Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            {filteredHosting.map((hosting) => {
              const isUnhosted = hosting.daysUntilExpiry === null;
              const status = isUnhosted ? 'deleted' as ExpiryStatus : getExpiryStatus(hosting.daysUntilExpiry!);
              return (
                <div
                  key={hosting.id ?? `d-${hosting.domainId}`}
                  onClick={() => navigate(`/domains/${hosting.domainId}`)}
                  className={`border-l-4 ${isUnhosted ? 'border-gray-400' : statusColors[status].border} bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md cursor-pointer transition-all p-4`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-primary-600" />
                        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{hosting.domainName || '-'}</span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hosting.clientName || '-'}</div>
                    </div>
                    {isUnhosted ? (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        {t('common.noPackage')}
                      </span>
                    ) : (
                      <StatusBadge status={status} days={hosting.daysUntilExpiry!} />
                    )}
                  </div>

                  {/* Info Grid */}
                  <div className="space-y-2 text-xs">
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                      <div className="text-gray-500 dark:text-gray-400 font-medium mb-1">{t('common.primaryContact')}</div>
                      <div className="text-gray-700 dark:text-gray-300 truncate">{[hosting.domainPrimaryName || hosting.clientContactPerson, hosting.domainPrimaryPhone || hosting.clientPhone, hosting.domainPrimaryEmail || hosting.clientEmail].filter(Boolean).join(', ') || '-'}</div>
                    </div>

                    <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                      <div className="text-gray-500 dark:text-gray-400 font-medium mb-1">{t('common.technicalContact')}</div>
                      <div className="text-gray-700 dark:text-gray-300 truncate">{[hosting.domainTechName || hosting.clientTechContact, hosting.domainTechPhone || hosting.clientTechPhone, hosting.domainTechEmail || hosting.clientTechEmail].filter(Boolean).join(', ') || '-'}</div>
                    </div>

                    {!isUnhosted && (
                      <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                        <div className="text-gray-500 dark:text-gray-400 font-medium mb-1">{t('common.package')}</div>
                        <div className="text-gray-700 dark:text-gray-300">{hosting.packageName || '-'}</div>
                        <div className="flex gap-2 text-gray-500 dark:text-gray-400">
                          <span>{hosting.packageMaxMailboxes || 0} {t('common.mailboxes')}</span>
                          <span>•</span>
                          <span>{hosting.packageStorageGb || 0} GB</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex gap-2">
                      {isSuperAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDomainToDelete({ domainId: hosting.domainId!, domainName: hosting.domainName || '' }); setDeleteDialogOpen(true); }}
                          className="btn btn-sm flex items-center gap-1 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/domains/${hosting.domainId}`); }}
                        className="btn btn-sm flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"
                      >
                        <Pencil className="w-3 h-3" />{t('common.edit')}
                      </button>
                      {!isUnhosted && hosting.id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExtend(hosting.id!, hosting.domainName || ''); }}
                          className="btn btn-primary btn-sm flex items-center gap-1"
                        >
                          <Calendar className="w-3 h-3" />{t('common.extend')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredHosting.map((hosting) => {
              const isUnhosted = hosting.daysUntilExpiry === null;
              const status = isUnhosted ? 'deleted' as ExpiryStatus : getExpiryStatus(hosting.daysUntilExpiry!);

              return (
                <div
                  key={hosting.id ?? `d-${hosting.domainId}`}
                  onClick={() => navigate(`/domains/${hosting.domainId}`)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  {/* Domain & Company */}
                  <div className="w-48 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary-600 flex-shrink-0" />
                      <span className="font-medium text-sm truncate">{hosting.domainName || '-'}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 ml-6 truncate">
                      {hosting.clientName || '-'}
                    </div>
                  </div>

                  {/* Contacts */}
                  <div className="min-w-0 flex-1 text-xs space-y-0.5 overflow-hidden">
                    <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400 whitespace-nowrap overflow-hidden">
                      <span className="text-gray-500 font-medium flex-shrink-0">{t('common.primaryContact')}</span>
                      <span className="truncate">{[hosting.domainPrimaryName || hosting.clientContactPerson, hosting.domainPrimaryPhone || hosting.clientPhone, hosting.domainPrimaryEmail || hosting.clientEmail].filter(Boolean).join(', ') || '-'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400 whitespace-nowrap overflow-hidden">
                      <span className="text-gray-500 font-medium flex-shrink-0">{t('common.technicalContact')}</span>
                      <span className="truncate">{[hosting.domainTechName || hosting.clientTechContact || hosting.clientContactPerson, hosting.domainTechPhone || hosting.clientTechPhone || hosting.clientPhone, hosting.domainTechEmail || hosting.clientTechEmail || hosting.clientEmail].filter(Boolean).join(', ') || '-'}</span>
                    </div>
                  </div>

                  {/* Package */}
                  <div className="w-36 flex-shrink-0 text-xs text-left">
                    <div className="text-gray-700 dark:text-gray-300 font-medium truncate">
                      {hosting.packageName || '—'}
                    </div>
                    {!isUnhosted && (
                      <div className="text-gray-500 truncate">
                        {hosting.packageMaxMailboxes || 0} {t('common.mailboxes')} · {hosting.packageStorageGb || 0} GB
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div className="w-32 flex-shrink-0">
                    {isUnhosted ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-400"></div>
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('common.statusNoPackage')}</span>
                      </div>
                    ) : (
                      <StatusBadge status={status} days={hosting.daysUntilExpiry!} />
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-2 flex-shrink-0">
                    {isSuperAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDomainToDelete({ domainId: hosting.domainId!, domainName: hosting.domainName || '' }); setDeleteDialogOpen(true); }}
                        className="btn btn-sm flex items-center gap-1 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/domains/${hosting.domainId}`); }}
                      className="btn btn-sm flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"
                    >
                      <Pencil className="w-3 h-3" />{t('common.edit')}
                    </button>
                    {!isUnhosted && hosting.id ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleExtend(hosting.id!, hosting.domainName || ''); }}
                        className="btn btn-primary btn-sm flex items-center gap-1"
                      >
                        <Calendar className="w-3 h-3" />{t('common.extend')}
                      </button>
                    ) : (
                      <button
                        disabled
                        className="btn btn-primary btn-sm flex items-center gap-1 opacity-40 cursor-not-allowed"
                      >
                        <Calendar className="w-3 h-3" />{t('common.extend')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Domain Modal */}
      <Modal
        isOpen={addDomainModalOpen}
        onClose={() => {
          setAddDomainModalOpen(false);
          resetDomainForm();
        }}
        title={t('domains.addDomain')}
        size="lg"
      >
        <form onSubmit={handleAddDomainSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">{t('domains.client')} *</label>
            <select
              value={selectedClientId}
              onChange={(e) => handleClientChange(e.target.value ? Number(e.target.value) : '')}
              className="input py-1.5 text-sm"
              required
            >
              <option value="">{t('common.selectClient')}</option>
              {clientsData?.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500">{t('common.domain')} *</label>
            <input
              type="text"
              value={domainForm.domainName}
              onChange={(e) => setDomainForm(prev => ({ ...prev, domainName: e.target.value }))}
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
                  checked={sameAsPrimary}
                  onChange={(e) => handleSameAsPrimaryToggle(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600"
                  disabled={!selectedClientId}
                />
                <span className="text-gray-500">{t('common.sameAsCompanyPrimary')}</span>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500">{t('common.nameAndSurname')} *</label>
                <input
                  value={domainForm.primaryName}
                  onChange={(e) => setDomainForm(prev => ({ ...prev, primaryName: e.target.value }))}
                  className="input py-1.5 text-sm"
                  disabled={sameAsPrimary && !!selectedClientId}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.phone')} *</label>
                <input
                  value={domainForm.primaryPhone}
                  onChange={(e) => setDomainForm(prev => ({ ...prev, primaryPhone: e.target.value }))}
                  className="input py-1.5 text-sm"
                  disabled={sameAsPrimary && !!selectedClientId}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.email')} *</label>
                <input
                  type="email"
                  value={domainForm.primaryEmail}
                  onChange={(e) => setDomainForm(prev => ({ ...prev, primaryEmail: e.target.value }))}
                  className="input py-1.5 text-sm"
                  disabled={sameAsPrimary && !!selectedClientId}
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
                  checked={sameAsTech}
                  onChange={(e) => handleSameAsTechToggle(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600"
                  disabled={!selectedClientId}
                />
                <span className="text-gray-500">{t('common.sameAsCompanyTechnical')}</span>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500">{t('common.nameAndSurname')} *</label>
                <input
                  value={domainForm.techName}
                  onChange={(e) => setDomainForm(prev => ({ ...prev, techName: e.target.value }))}
                  className="input py-1.5 text-sm"
                  disabled={sameAsTech && !!selectedClientId}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.phone')} *</label>
                <input
                  value={domainForm.techPhone}
                  onChange={(e) => setDomainForm(prev => ({ ...prev, techPhone: e.target.value }))}
                  className="input py-1.5 text-sm"
                  disabled={sameAsTech && !!selectedClientId}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.email')} *</label>
                <input
                  type="email"
                  value={domainForm.techEmail}
                  onChange={(e) => setDomainForm(prev => ({ ...prev, techEmail: e.target.value }))}
                  className="input py-1.5 text-sm"
                  disabled={sameAsTech && !!selectedClientId}
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
                value={selectedPackageId}
                onChange={(e) => setSelectedPackageId(e.target.value ? Number(e.target.value) : '')}
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
              const selectedPkg = packagesData?.packages.find(p => p.id === Number(selectedPackageId));
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

          {/* Expiry Date */}
          {selectedPackageId && (
            <div className="pt-3 border-t dark:border-gray-700">
              <label className="text-xs text-gray-500">{t('common.expiryDate')} *</label>
              <DateInput
                name="expiryDate"
                value={domainForm.expiryDate}
                onChange={(value) => setDomainForm(prev => ({ ...prev, expiryDate: value }))}
                required
              />
              <div className="flex gap-1.5 flex-wrap mt-2">
                {periodButtons.map((btn) => (
                  <button
                    key={btn.years}
                    type="button"
                    onClick={() => setDomainForm(prev => ({
                      ...prev,
                      expiryDate: calculateExpiryDate(getTodayDate(), btn.years)
                    }))}
                    className="btn btn-secondary text-xs py-1 px-2"
                  >
                    {'labelKey' in btn ? t(btn.labelKey as string) : btn.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="pt-3 border-t dark:border-gray-700">
            <label className="text-xs text-gray-500">{t('common.notes')}</label>
            <textarea
              value={domainForm.notes}
              onChange={(e) => setDomainForm(prev => ({ ...prev, notes: e.target.value }))}
              className="input py-1.5 text-sm"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setAddDomainModalOpen(false);
                resetDomainForm();
              }}
              className="btn btn-secondary py-1.5 px-3 text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary py-1.5 px-3 text-sm"
              disabled={createDomainMutation.isPending}
            >
              {createDomainMutation.isPending ? t('common.creating') : t('common.add')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Extend Modal */}
      <Modal
        isOpen={extendModalOpen}
        onClose={() => {
          setExtendModalOpen(false);
          setExtendItem(null);
          setSelectedExtendPeriod('');
          setExtendFromToday(false);
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
                <span className="font-medium">{option.label}</span>
              </label>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex justify-between items-center pt-3 border-t dark:border-gray-700">
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setExtendModalOpen(false);
                  setExtendItem(null);
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
                  if (selectedExtendPeriod && extendItem) {
                    extendMutation.mutate({
                      hostingId: extendItem.id,
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

      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => { setDeleteDialogOpen(false); setDomainToDelete(null); }}
        onConfirm={() => domainToDelete && deleteDomainMutation.mutate(domainToDelete.domainId)}
        title={t('domains.deleteDomain')}
        message={t('domains.deleteConfirm', { name: domainToDelete?.domainName })}
        isLoading={deleteDomainMutation.isPending}
      />
    </div>
  );
}
