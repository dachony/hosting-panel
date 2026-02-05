import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Domain, Hosting, Package, Client, ExpiryStatus, MailServer, MailSecurity } from '../types';
import { ArrowLeft, Globe, Package as PackageIcon, ChevronDown, ChevronRight, Pencil, Lock, Unlock, Server, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

interface DomainWithDetails extends Domain {
  clientName?: string | null;
}

interface HostingWithDetails extends Hosting {
  daysUntilExpiry: number;
  expiryStatus?: ExpiryStatus;
  packageName?: string | null;
}

const statusColors: Record<ExpiryStatus, { border: string; bg: string; text: string }> = {
  green: { border: 'border-green-500', bg: 'bg-green-500/20', text: 'text-green-600 dark:text-green-400' },
  yellow: { border: 'border-yellow-500', bg: 'bg-yellow-500/20', text: 'text-yellow-600 dark:text-yellow-400' },
  orange: { border: 'border-orange-500', bg: 'bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400' },
  red: { border: 'border-red-500', bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400' },
};

const periodButtons = [
  { years: 1, label: '+1' },
  { years: 2, label: '+2' },
  { years: 3, label: '+3' },
  { years: 5, label: '+5' },
  { years: 100, label: 'Unlim.' },
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

function StatusBadge({ status, days }: { status: ExpiryStatus; days: number }) {
  const dotColor = status === 'green' ? 'bg-green-500' : status === 'yellow' ? 'bg-yellow-500' : status === 'orange' ? 'bg-orange-500' : 'bg-red-500';
  const textColor = status === 'green' ? 'text-green-600' : status === 'yellow' ? 'text-yellow-600' : status === 'orange' ? 'text-orange-600' : 'text-red-600';

  if (days <= 0) {
    return (
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${dotColor}`}></div>
        <span className={`text-sm font-bold ${textColor}`}>EXPIRED</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${dotColor}`}></div>
      <div className="text-center">
        <div className={`text-xs ${textColor}`}>days left</div>
        <div className={`text-lg font-bold ${textColor} leading-tight`}>{days > 36000 ? '∞' : days}</div>
      </div>
    </div>
  );
}

export default function DomainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isDomainExpanded, setIsDomainExpanded] = useState(true);
  const [isDomainLocked, setIsDomainLocked] = useState(true);
  const [sameAsPrimaryContact, setSameAsPrimaryContact] = useState(true);
  const [sameAsTechContact, setSameAsTechContact] = useState(true);
  const [originalExpiryDate, setOriginalExpiryDate] = useState('');

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
      const domainHosting = response.hosting.find(h => h.domainId === Number(id));
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
  const { data: mailServersData } = useQuery({
    queryKey: ['mail-servers'],
    queryFn: () => api.get<{ mailServers: MailServer[] }>('/api/mail-servers'),
  });

  // Fetch mail security
  const { data: mailSecurityData } = useQuery({
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
      toast.success('Domain updated');
      setIsDomainLocked(true);
    },
    onError: () => toast.error('Error updating domain'),
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
      toast.success(hosting ? 'Hosting updated' : 'Hosting created');
    },
    onError: () => toast.error('Error updating hosting'),
  });

  // Toggle hosting status mutation
  const toggleMutation = useMutation({
    mutationFn: () => api.post(`/api/hosting/${hosting?.id}/toggle`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domain-hosting', id] });
      queryClient.invalidateQueries({ queryKey: ['hosting'] });
      toast.success('Status updated');
    },
    onError: () => toast.error('Error updating status'),
  });

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
        <p className="text-gray-500 dark:text-gray-400">Domain not found</p>
        <button onClick={() => navigate('/domains')} className="btn btn-primary mt-4">
          Back to Domains
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
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {domain.domainName}
        </h1>
      </div>

      {/* Domain Section */}
      <div className="card !p-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center">
            <Globe className="w-4 h-4 mr-2 text-primary-600" />
            <h2 className="text-base font-semibold">Domain</h2>
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
                <span className="text-gray-500 font-medium">Primary</span> {primaryName}, {primaryPhone}, {primaryEmail}
              </span>
              <span className="text-gray-400 mx-1 flex-shrink-0">|</span>
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                <span className="text-gray-500 font-medium">Technical</span> {techName}, {techPhone}, {techEmail}
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
                className="btn btn-secondary !text-xs !py-1 !px-2 flex items-center gap-1"
              >
                {isDomainLocked ? (
                  <>
                    <Pencil className="w-3 h-3" />
                    Edit
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3" />
                    Save
                  </>
                )}
              </button>
              {!isDomainLocked && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDomainLocked(true);
                  }}
                  className="btn btn-secondary !text-xs !py-1 !px-2 flex items-center gap-1"
                >
                  <Unlock className="w-3 h-3" />
                  Cancel
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
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">Domain Name</span>
                  {isDomainLocked ? (
                    <div className="mt-1 font-medium text-sm">{domain.domainName}</div>
                  ) : (
                    <input
                      type="text"
                      value={domainForm.domainName}
                      onChange={(e) => setDomainForm({ ...domainForm, domainName: e.target.value })}
                      className="input !py-1 !text-sm mt-1"
                    />
                  )}
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">Client</span>
                  {isDomainLocked ? (
                    <div className="mt-1 font-medium text-sm">{domain.clientName || 'No client assigned'}</div>
                  ) : (
                    <select
                      value={domainForm.clientId}
                      onChange={(e) => handleClientChange(e.target.value ? Number(e.target.value) : '')}
                      className="input !py-1 !text-sm mt-1"
                    >
                      <option value="">-- No client --</option>
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
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">Primary Contact</span>
                  {!isDomainLocked && (
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sameAsPrimaryContact}
                        onChange={(e) => handleSameAsPrimaryToggle(e.target.checked)}
                        className="w-3 h-3 rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-gray-500">Same as company primary contact</span>
                    </label>
                  )}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Name</label>
                    {isDomainLocked ? (
                      <div className="text-sm">{primaryName}</div>
                    ) : (
                      <input
                        type="text"
                        value={domainForm.primaryName}
                        onChange={(e) => setDomainForm({ ...domainForm, primaryName: e.target.value })}
                        className="input !py-1 !text-sm"
                        disabled={sameAsPrimaryContact}
                        required
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Phone</label>
                    {isDomainLocked ? (
                      <div className="text-sm">{primaryPhone}</div>
                    ) : (
                      <input
                        type="text"
                        value={domainForm.primaryPhone}
                        onChange={(e) => setDomainForm({ ...domainForm, primaryPhone: e.target.value })}
                        className="input !py-1 !text-sm"
                        disabled={sameAsPrimaryContact}
                        required
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Email</label>
                    {isDomainLocked ? (
                      <div className="text-sm">{primaryEmail}</div>
                    ) : (
                      <input
                        type="email"
                        value={domainForm.primaryEmail}
                        onChange={(e) => setDomainForm({ ...domainForm, primaryEmail: e.target.value })}
                        className="input !py-1 !text-sm"
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
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">Technical Contact</span>
                  {!isDomainLocked && (
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sameAsTechContact}
                        onChange={(e) => handleSameAsTechToggle(e.target.checked)}
                        className="w-3 h-3 rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-gray-500">Same as company technical contact</span>
                    </label>
                  )}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Name</label>
                    {isDomainLocked ? (
                      <div className="text-sm">{techName}</div>
                    ) : (
                      <input
                        type="text"
                        value={domainForm.techName}
                        onChange={(e) => setDomainForm({ ...domainForm, techName: e.target.value })}
                        className="input !py-1 !text-sm"
                        disabled={sameAsTechContact}
                        required
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Phone</label>
                    {isDomainLocked ? (
                      <div className="text-sm">{techPhone}</div>
                    ) : (
                      <input
                        type="text"
                        value={domainForm.techPhone}
                        onChange={(e) => setDomainForm({ ...domainForm, techPhone: e.target.value })}
                        className="input !py-1 !text-sm"
                        disabled={sameAsTechContact}
                        required
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">Email</label>
                    {isDomainLocked ? (
                      <div className="text-sm">{techEmail}</div>
                    ) : (
                      <input
                        type="email"
                        value={domainForm.techEmail}
                        onChange={(e) => setDomainForm({ ...domainForm, techEmail: e.target.value })}
                        className="input !py-1 !text-sm"
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
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">Package</span>
                    {isDomainLocked ? (
                      <span className="font-medium text-sm">{hosting?.packageName || 'No package'}</span>
                    ) : (
                      <select
                        value={hostingForm.packageId}
                        onChange={(e) => setHostingForm({ ...hostingForm, packageId: e.target.value ? Number(e.target.value) : '' })}
                        className="input !py-1 !text-sm"
                      >
                        <option value="">-- No package --</option>
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
                    <span className="text-gray-600 dark:text-gray-400">{selectedPackage.maxMailboxes} mailboxes</span>
                    <span className="text-gray-600 dark:text-gray-400">{selectedPackage.storageGb} GB</span>
                    <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                      <Server className="w-3 h-3" />
                      <span className="text-gray-500 font-medium">Mail Server</span>
                      <span>{selectedPackage.mailServerName || '-'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                      <Shield className="w-3 h-3" />
                      <span className="text-gray-500 font-medium">Mail Security</span>
                      <span>{selectedPackage.mailSecurityName || '-'}</span>
                    </div>
                  </div>
                )}

                {/* Dates row */}
                {(hosting || !isDomainLocked) && (
                  <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t dark:border-gray-700 text-xs flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">Added:</span>
                      <span className="font-medium">{formatDateDisplay(hosting?.startDate || getTodayDate())}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">Expiry:</span>
                      <span className="font-medium">{formatDateDisplay(originalExpiryDate || hosting?.expiryDate || '')}</span>
                    </div>
                    {!isDomainLocked && (
                      <div className="flex items-center gap-1.5 ml-auto bg-primary-50 dark:bg-primary-900/20 rounded px-2 py-1">
                        <span className="text-[11px] font-medium text-primary-700 dark:text-primary-300">Extend to:</span>
                        <input
                          type="date"
                          value={hostingForm.expiryDate}
                          onChange={(e) => setHostingForm({ ...hostingForm, expiryDate: e.target.value })}
                          className="input !py-0.5 !px-1.5 !text-xs w-28"
                        />
                        {periodButtons.map((btn) => (
                          <button
                            key={btn.years}
                            type="button"
                            onClick={() => setHostingForm({
                              ...hostingForm,
                              expiryDate: calculateExpiryDate(originalExpiryDate || hosting?.expiryDate || getTodayDate(), btn.years)
                            })}
                            className="btn btn-secondary !text-[11px] !py-0.5 !px-1"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Status Toggle */}
              {hosting && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">Status</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        hosting.isActive !== false
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {hosting.isActive !== false ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleMutation.mutate()}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                        hosting.isActive !== false
                          ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
                          : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                      }`}
                    >
                      {hosting.isActive !== false ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border dark:border-gray-700">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase">Notes</span>
                {isDomainLocked ? (
                  <div className="mt-1 text-sm">{domain.notes || '-'}</div>
                ) : (
                  <textarea
                    value={domainForm.notes}
                    onChange={(e) => setDomainForm({ ...domainForm, notes: e.target.value })}
                    className="input !py-1 !text-sm mt-1"
                    rows={2}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
