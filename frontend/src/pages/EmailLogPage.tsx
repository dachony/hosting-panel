import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Search, Loader2, Mail, Trash2, RefreshCw, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

interface EmailItem {
  ID: string;
  From: { Relays: string[]; Mailbox: string; Domain: string; Params: string };
  To: Array<{ Relays: string[]; Mailbox: string; Domain: string; Params: string }>;
  Content: {
    Headers: Record<string, string[]>;
    Body: string;
    Size: number;
    MIME: unknown;
  };
  Created: string;
  Raw: { From: string; To: string[]; Data: string; Helo: string };
}

interface EmailResponse {
  emails: EmailItem[];
  total: number;
  count: number;
  start: number;
  error?: string;
}

export default function EmailLogPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const limit = 30;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['email-logs', page],
    queryFn: () => api.get<EmailResponse>(`/api/system/emails?start=${page * limit}&limit=${limit}`),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => api.delete('/api/system/emails'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
      toast.success('Svi emailovi obrisani');
    },
    onError: () => toast.error('Error deleting'),
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('sr-RS', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getEmailAddress = (item: EmailItem) => {
    return `${item.From.Mailbox}@${item.From.Domain}`;
  };

  const getToAddresses = (item: EmailItem) => {
    return item.To.map(to => `${to.Mailbox}@${to.Domain}`).join(', ');
  };

  const getSubject = (item: EmailItem) => {
    return item.Content?.Headers?.Subject?.[0] || '(no subject)';
  };

  const filteredEmails = (data?.emails || []).filter(email => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      getEmailAddress(email).toLowerCase().includes(search) ||
      getToAddresses(email).toLowerCase().includes(search) ||
      getSubject(email).toLowerCase().includes(search)
    );
  });

  const totalPages = Math.ceil((data?.total || 0) / limit);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Email Log
      </h1>

      <div className="card !p-0 overflow-hidden">
        <div className="flex flex-wrap gap-3 items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="relative min-w-[200px]">
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
              onClick={() => refetch()}
              className="btn btn-secondary !py-1.5 !px-3 !text-sm flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="http://localhost:8025"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary !py-1.5 !px-3 !text-sm flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              MailHog UI
            </a>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete all emails?')) {
                  deleteAllMutation.mutate();
                }
              }}
              disabled={deleteAllMutation.isPending || !data?.total}
              className="btn !py-1.5 !px-3 !text-sm flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete all
            </button>
          </div>
        </div>

        {data?.error && (
          <div className="px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 text-sm">
            MailHog nije dostupan. Proverite da li je servis pokrenut.
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : filteredEmails.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">
            {searchTerm ? 'Nema rezultata' : 'Nema emailova'}
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredEmails.map((email) => (
              <div
                key={email.ID}
                onClick={() => setSelectedEmail(selectedEmail?.ID === email.ID ? null : email)}
                className="px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {getSubject(email)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <span>Od: {getEmailAddress(email)}</span>
                      <span className="text-gray-400">→</span>
                      <span>Za: {getToAddresses(email)}</span>
                      <span className="text-gray-400">|</span>
                      <span>{formatDate(email.Created)}</span>
                    </div>

                    {selectedEmail?.ID === email.ID && (
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                        <div className="font-medium mb-2">Content:</div>
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none overflow-auto max-h-96"
                          dangerouslySetInnerHTML={{
                            __html: email.Content?.Body || '(empty content)'
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
              Total: {data?.total || 0} emails
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn btn-secondary !py-1 !px-2 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn btn-secondary !py-1 !px-2 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
