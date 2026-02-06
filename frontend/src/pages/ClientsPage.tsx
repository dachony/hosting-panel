import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Client } from '../types';
import Modal from '../components/common/Modal';
import { Plus, Search, Users, Loader2, Pencil, Trash2, LayoutList, LayoutGrid } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useAuth } from '../context/AuthContext';

type ViewMode = 'list' | 'cards';

export default function ClientsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  // Open modal if ?add=true
  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      setModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [techSameAsPrimary, setTechSameAsPrimary] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const { data, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ clients: Client[] }>('/api/clients'),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Client>) => {
      if (selectedClient) {
        return api.put(`/api/clients/${selectedClient.id}`, data);
      }
      return api.post('/api/clients', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(selectedClient ? t('clients.clientUpdated') : t('clients.clientCreated'));
      setModalOpen(false);
      setSelectedClient(null);
    },
    onError: () => {
      toast.error(t('common.errorSaving'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/clients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(t('clients.clientDeleted'));
      setDeleteDialogOpen(false);
      setClientToDelete(null);
    },
    onError: () => toast.error(t('common.errorDeleting')),
  });

  const handleEdit = (client: Client) => {
    setSelectedClient(client);
    // Check if tech contact is same as primary
    const isSame = client.techContact === client.contactPerson &&
                   client.techPhone === client.phone &&
                   client.techEmail === client.email1;
    setTechSameAsPrimary(isSame && !!client.techContact);
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const contactPerson = formData.get('contactPerson') as string;
    const phone = formData.get('phone') as string || null;
    const email1 = formData.get('email1') as string;

    saveMutation.mutate({
      name: formData.get('name') as string,
      domain: selectedClient?.domain || null,
      contactPerson,
      phone,
      email1,
      email2: null,
      email3: null,
      techContact: techSameAsPrimary ? contactPerson : (formData.get('techContact') as string || null),
      techPhone: techSameAsPrimary ? phone : (formData.get('techPhone') as string || null),
      techEmail: techSameAsPrimary ? email1 : (formData.get('techEmail') as string || null),
      address: formData.get('address') as string || null,
      pib: formData.get('pib') as string || null,
      mib: formData.get('mib') as string || null,
      notes: formData.get('notes') as string || null,
    });
  };

  // Filter clients by search
  const filteredClients = data?.clients.filter(client => {
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      return (
        client.name?.toLowerCase().includes(search) ||
        client.domain?.toLowerCase().includes(search) ||
        client.contactPerson?.toLowerCase().includes(search) ||
        client.email1?.toLowerCase().includes(search) ||
        client.phone?.toLowerCase().includes(search) ||
        client.techContact?.toLowerCase().includes(search) ||
        client.techEmail?.toLowerCase().includes(search) ||
        client.techPhone?.toLowerCase().includes(search)
      );
    }
    return true;
  }) || [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('clients.title')}
      </h1>

      {/* Clients List */}
      <div className="card !p-0 overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('common.searchPlaceholder')}
                className="input !py-1.5 !text-sm w-full pl-8"
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
            onClick={() => {
              setSelectedClient(null);
              setModalOpen(true);
            }}
            className="btn btn-primary btn-sm flex items-center"
          >
            <Plus className="w-3 h-3 mr-1" />
            {t('common.add')}
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500">
            {searchTerm ? t('common.noResults') : t('clients.noClients')}
          </div>
        ) : viewMode === 'cards' ? (
          /* Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            {filteredClients.map((client) => (
              <div
                key={client.id}
                onClick={() => navigate(`/clients/${client.id}`)}
                className="border-l-4 border-primary-500 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md cursor-pointer transition-all p-4"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary-600" />
                    <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{client.name}</span>
                  </div>
                </div>

                {/* Info Grid */}
                <div className="space-y-2 text-xs">
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                    <div className="text-gray-500 dark:text-gray-400 font-medium mb-1">{t('common.primaryContact')}</div>
                    <div className="text-gray-700 dark:text-gray-300 truncate">{[client.contactPerson, client.phone, client.email1].filter(Boolean).join(', ') || '-'}</div>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                    <div className="text-gray-500 dark:text-gray-400 font-medium mb-1">{t('common.technicalContact')}</div>
                    <div className="text-gray-700 dark:text-gray-300 truncate">{[client.techContact || client.contactPerson, client.techPhone || client.phone, client.techEmail || client.email1].filter(Boolean).join(', ') || '-'}</div>
                  </div>

                  {client.address && (
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                      <div className="text-gray-500 dark:text-gray-400 font-medium mb-1">{t('common.address')}</div>
                      <div className="text-gray-700 dark:text-gray-300">{client.address}</div>
                    </div>
                  )}

                  {(client.pib || client.mib) && (
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-2 flex gap-4">
                      {client.pib && (
                        <div>
                          <div className="text-gray-500 dark:text-gray-400 font-medium">PIB</div>
                          <div className="text-gray-700 dark:text-gray-300">{client.pib}</div>
                        </div>
                      )}
                      {client.mib && (
                        <div>
                          <div className="text-gray-500 dark:text-gray-400 font-medium">MIB</div>
                          <div className="text-gray-700 dark:text-gray-300">{client.mib}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                  {isSuperAdmin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setClientToDelete(client); setDeleteDialogOpen(true); }}
                      className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150"
                    >
                      <Trash2 className="w-3 h-3" />{t('common.delete')}
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(client); }}
                    className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"
                  >
                    <Pencil className="w-3 h-3" />{t('common.edit')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View */
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredClients.map((client) => (
              <div
                key={client.id}
                onClick={() => navigate(`/clients/${client.id}`)}
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
              >
                {/* Client Name */}
                <div className="w-44 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary-600 flex-shrink-0" />
                    <span className="font-medium text-sm">{client.name}</span>
                  </div>
                </div>

                {/* Contacts */}
                <div className="min-w-0 flex-1 text-xs space-y-1">
                  <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                    <span className="text-gray-500 font-medium w-28 flex-shrink-0">{t('common.primaryContact')}</span>
                    <span className="truncate">{[client.contactPerson, client.phone, client.email1].filter(Boolean).join(', ') || '-'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                    <span className="text-gray-500 font-medium w-28 flex-shrink-0">{t('common.technicalContact')}</span>
                    <span className="truncate">{[client.techContact || client.contactPerson, client.techPhone || client.phone, client.techEmail || client.email1].filter(Boolean).join(', ') || '-'}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 flex-shrink-0">
                  {isSuperAdmin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setClientToDelete(client); setDeleteDialogOpen(true); }}
                      className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 active:bg-rose-300 active:scale-[0.97] dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 dark:hover:bg-rose-500/40 dark:hover:border-rose-400/70 dark:active:bg-rose-500/50 transition-all duration-150"
                    >
                      <Trash2 className="w-3 h-3" />{t('common.delete')}
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(client); }}
                    className="!text-xs !py-1 !px-2 flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:border-emerald-400 active:bg-emerald-300 active:scale-[0.97] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50 dark:hover:bg-emerald-500/40 dark:hover:border-emerald-400/70 dark:active:bg-emerald-500/50 transition-all duration-150"
                  >
                    <Pencil className="w-3 h-3" />{t('common.edit')}
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
        onClose={() => {
          setModalOpen(false);
          setSelectedClient(null);
          setTechSameAsPrimary(false);
        }}
        title={selectedClient ? t('clients.editClient') : t('clients.addClient')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">{t('common.name') + ' *'}</label>
            <input
              name="name"
              defaultValue={selectedClient?.name}
              className="input py-1.5 text-sm"
              required
            />
          </div>

          {/* Primary Contact */}
          <div className="pt-3 border-t dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase">{t('common.primaryContact')}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500">{t('common.name') + ' *'}</label>
                <input
                  name="contactPerson"
                  defaultValue={selectedClient?.contactPerson || ''}
                  className="input py-1.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.phone') + ' *'}</label>
                <input
                  name="phone"
                  defaultValue={selectedClient?.phone || ''}
                  className="input py-1.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('common.email') + ' *'}</label>
                <input
                  name="email1"
                  type="email"
                  defaultValue={selectedClient?.email1 || ''}
                  className="input py-1.5 text-sm"
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
                  checked={techSameAsPrimary}
                  onChange={(e) => setTechSameAsPrimary(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600"
                />
                <span className="text-gray-500">{t('common.sameAsPrimaryContact')}</span>
              </label>
            </div>
            {!techSameAsPrimary && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500">{t('common.name') + ' *'}</label>
                  <input
                    name="techContact"
                    defaultValue={selectedClient?.techContact || ''}
                    className="input py-1.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{t('common.phone') + ' *'}</label>
                  <input
                    name="techPhone"
                    defaultValue={selectedClient?.techPhone || ''}
                    className="input py-1.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{t('common.email') + ' *'}</label>
                  <input
                    name="techEmail"
                    type="email"
                    defaultValue={selectedClient?.techEmail || ''}
                    className="input py-1.5 text-sm"
                    required
                  />
                </div>
              </div>
            )}
          </div>

          {/* Business Info */}
          <div className="pt-3 border-t dark:border-gray-700">
            <span className="text-xs font-medium text-gray-500 uppercase">{t('common.businessInfo')}</span>
            <div className="mt-2">
              <label className="text-xs text-gray-500">{t('common.address')}</label>
              <input
                name="address"
                defaultValue={selectedClient?.address || ''}
                className="input py-1.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="text-xs text-gray-500">PIB</label>
                <input
                  name="pib"
                  defaultValue={selectedClient?.pib || ''}
                  className="input py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">MIB</label>
                <input
                  name="mib"
                  defaultValue={selectedClient?.mib || ''}
                  className="input py-1.5 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="pt-3 border-t dark:border-gray-700">
            <label className="text-xs text-gray-500">{t('common.notes')}</label>
            <textarea
              name="notes"
              defaultValue={selectedClient?.notes || ''}
              className="input py-1.5 text-sm"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="btn btn-secondary py-1.5 px-3 text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary py-1.5 px-3 text-sm"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => { setDeleteDialogOpen(false); setClientToDelete(null); }}
        onConfirm={() => clientToDelete && deleteMutation.mutate(clientToDelete.id)}
        title={t('clients.deleteClient')}
        message={t('clients.deleteConfirm', { name: clientToDelete?.name })}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
