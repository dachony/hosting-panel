import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { api } from '../api/client';
import { Search, Loader2, Trash2, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertTriangle, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

interface EmailLogItem {
  id: number;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  htmlContent: string;
  textContent: string | null;
  status: 'sent' | 'failed';
  error: string | null;
  createdAt: string;
}

interface EmailResponse {
  emails: EmailLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function EmailLogPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const limit = 30;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['email-logs', page, searchTerm],
    queryFn: () => api.get<EmailResponse>(`/api/system/emails?page=${page}&limit=${limit}&search=${encodeURIComponent(searchTerm)}`),
    refetchInterval: 30000,
  });

  const deleteAllMutation = useMutation({
    mutationFn: (days?: number) => api.delete(`/api/system/emails${days ? `?days=${days}` : ''}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
      toast.success(t('emailLog.allEmailsDeleted'));
      setDeleteMenuOpen(false);
    },
    onError: () => toast.error(t('emailLog.errorDeleting')),
  });

  const handleSearch = () => {
    setPage(1);
    setSearchTerm(searchInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const emails = data?.emails || [];
  const totalPages = data?.totalPages || 0;
  const total = data?.total || 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('emailLog.title')}
      </h1>

      <div className="card !p-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="relative min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('emailLog.searchPlaceholder')}
                className="input !py-1.5 !text-sm w-full pl-8"
              />
            </div>
            <button
              onClick={() => refetch()}
              className="btn btn-secondary !py-1.5 !px-3 !text-sm flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('emailLog.refresh')}
            </button>
          </div>
          <div className="flex items-center gap-3">
            {/* Delete dropdown */}
            <div className="relative">
              <button
                onClick={() => setDeleteMenuOpen(!deleteMenuOpen)}
                disabled={deleteAllMutation.isPending || !total}
                className="btn !py-1.5 !px-3 !text-sm flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('emailLog.deleteLogs')}
                <ChevronDown className="w-3 h-3" />
              </button>
              {deleteMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDeleteMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 min-w-[200px] py-1">
                    <button
                      onClick={() => {
                        if (confirm(t('emailLog.deleteAllConfirm'))) {
                          deleteAllMutation.mutate(undefined);
                        }
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    >
                      {t('emailLog.deleteAll')}
                    </button>
                    <button
                      onClick={() => deleteAllMutation.mutate(30)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      {t('emailLog.deleteOlderThan30')}
                    </button>
                    <button
                      onClick={() => deleteAllMutation.mutate(90)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      {t('emailLog.deleteOlderThan90')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Email list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : emails.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">
            {searchTerm ? t('common.noResults') : t('emailLog.noEmails')}
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {emails.map((email) => (
              <div
                key={email.id}
                onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
                className="px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {email.status === 'sent' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {email.subject}
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                        email.status === 'sent'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                      }`}>
                        {email.status === 'sent' ? t('emailLog.statusSent') : t('emailLog.statusFailed')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <span>{t('emailLog.to')} {email.toEmail}</span>
                      <span className="text-gray-400">|</span>
                      <span>{t('emailLog.from')} {email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}</span>
                      <span className="text-gray-400">|</span>
                      <span>{formatDate(email.createdAt)}</span>
                    </div>

                    {/* Error message for failed emails */}
                    {email.status === 'failed' && email.error && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-rose-600 dark:text-rose-400">
                        <AlertTriangle className="w-3 h-3" />
                        {email.error}
                      </div>
                    )}

                    {/* Expanded content */}
                    {expandedId === email.id && (
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                        <div className="font-medium mb-2">{t('emailLog.content')}</div>
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none overflow-auto max-h-96 bg-white dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(email.htmlContent || t('emailLog.emptyContent'))
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500">
              {t('emailLog.totalEmails', { count: total })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-secondary !py-1 !px-2 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-secondary !py-1 !px-2 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Footer with total when only 1 page */}
        {totalPages <= 1 && total > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500">
              {t('emailLog.totalEmails', { count: total })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
