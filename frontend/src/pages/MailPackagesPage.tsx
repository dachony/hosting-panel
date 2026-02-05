import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Package, MailServer, MailSecurity } from '../types';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { Plus, Package as PackageIcon, Search, Loader2, HardDrive, Shield, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PackagesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMailServerId, setSelectedMailServerId] = useState<number | null>(null);
  const [selectedMailSecurityId, setSelectedMailSecurityId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['packages'],
    queryFn: () => api.get<{ packages: Package[] }>('/api/packages'),
  });

  const { data: mailServersData } = useQuery({
    queryKey: ['mail-servers'],
    queryFn: () => api.get<{ servers: MailServer[] }>('/api/mail-servers'),
  });

  const { data: mailSecurityData } = useQuery({
    queryKey: ['mail-security'],
    queryFn: () => api.get<{ services: MailSecurity[] }>('/api/mail-security'),
  });

  // Set defaults when modal opens
  useEffect(() => {
    if (modalOpen && !selectedPackage) {
      const defaultServer = mailServersData?.servers?.find(s => s.isDefault);
      const defaultSecurity = mailSecurityData?.services?.find(s => s.isDefault);
      setSelectedMailServerId(defaultServer?.id || null);
      setSelectedMailSecurityId(defaultSecurity?.id || null);
    } else if (modalOpen && selectedPackage) {
      setSelectedMailServerId(selectedPackage.mailServerId || null);
      setSelectedMailSecurityId(selectedPackage.mailSecurityId || null);
    }
  }, [modalOpen, selectedPackage, mailServersData, mailSecurityData]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/packages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      toast.success('Package deleted');
      setDeleteDialogOpen(false);
      setSelectedPackage(null);
    },
    onError: () => toast.error('Error deleting'),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Package>) => {
      if (selectedPackage) {
        return api.put(`/api/packages/${selectedPackage.id}`, data);
      }
      return api.post('/api/packages', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      toast.success(selectedPackage ? 'Package updated' : 'Package created');
      setModalOpen(false);
      setSelectedPackage(null);
    },
    onError: () => toast.error('Error saving'),
  });

  const handleRowClick = (pkg: Package) => {
    setSelectedPackage(pkg);
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const featuresStr = formData.get('features') as string;
    saveMutation.mutate({
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      maxMailboxes: parseInt(formData.get('maxMailboxes') as string),
      storageGb: parseFloat(formData.get('storageGb') as string),
      price: parseFloat(formData.get('price') as string),
      features: featuresStr ? featuresStr.split(',').map(f => f.trim()).filter(Boolean) : null,
      mailServerId: selectedMailServerId,
      mailSecurityId: selectedMailSecurityId,
    });
  };

  const filteredPackages = (data?.packages || []).filter((pkg) => {
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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Packages
      </h1>

      {/* Packages List */}
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
            onClick={() => { setSelectedPackage(null); setModalOpen(true); }}
            className="btn btn-primary btn-sm flex items-center"
          >
            <Plus className="w-3 h-3 mr-1" /> Add
          </button>
        </div>
        {isLoading ? (
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
                onClick={() => handleRowClick(pkg)}
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
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
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-500">Mail server -</span>
                  {pkg.mailServerName ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                      <HardDrive className="w-2.5 h-2.5 mr-0.5" />{pkg.mailServerName}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">none</span>
                  )}
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-500">Mail security -</span>
                  {pkg.mailSecurityName ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                      <Shield className="w-2.5 h-2.5 mr-0.5" />{pkg.mailSecurityName}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">none</span>
                  )}
                  {pkg.features && pkg.features.length > 0 && (
                    <>
                      <span className="text-gray-400">|</span>
                      <div className="flex gap-1">
                        {pkg.features.slice(0, 2).map((f, i) => (
                          <span key={i} className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded">
                            {f}
                          </span>
                        ))}
                        {pkg.features.length > 2 && (
                          <span className="text-xs text-gray-500">+{pkg.features.length - 2}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRowClick(pkg); }}
                    className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedPackage(pkg); setDeleteDialogOpen(true); }}
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

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedPackage(null); }}
        title={selectedPackage ? 'Edit Package' : 'Add Package'}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
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
            <button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary !py-1.5 !px-3 !text-sm">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary !py-1.5 !px-4 !text-sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => { setDeleteDialogOpen(false); setSelectedPackage(null); }}
        onConfirm={() => selectedPackage && deleteMutation.mutate(selectedPackage.id)}
        title="Delete Package"
        message={`Are you sure you want to delete "${selectedPackage?.name}"?`}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
