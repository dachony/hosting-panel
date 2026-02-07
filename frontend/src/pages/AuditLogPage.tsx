import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { Search, Loader2, Filter, ChevronLeft, ChevronRight, X, User, Globe, Clock, MapPin, Monitor } from 'lucide-react';

// Default column widths
const DEFAULT_COLUMN_WIDTHS = {
  time: 110,
  user: 100,
  email: 160,
  action: 80,
  client: 120,
  domain: 150,
  description: 300,
};

interface AuditLog {
  id: number;
  userId: number | null;
  userName: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: number | null;
  entityName: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface PaginatedResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const actionLabels: Record<string, string> = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  login: 'Login',
  logout: 'Logout',
};

const actionColors: Record<string, string> = {
  create: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400',
  delete: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400',
  login: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400',
  logout: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const entityLabels: Record<string, string> = {
  client: 'Client',
  domain: 'Domain',
  hosting: 'Hosting',
  mail: 'Mail',
  user: 'User',
  template: 'Template',
  package: 'Package',
  notification: 'Notification',
  auth: 'Auth',
  settings: 'Settings',
};

// Generate short description based on action and entity (for table)
function generateDescription(log: AuditLog): string {
  const entity = entityLabels[log.entityType] || log.entityType;
  const name = log.entityName ? `"${log.entityName}"` : '';

  switch (log.action) {
    case 'create':
      return `Created ${entity.toLowerCase()} ${name}`.trim();
    case 'update':
      return `Updated ${entity.toLowerCase()} ${name}`.trim();
    case 'delete':
      return `Deleted ${entity.toLowerCase()} ${name}`.trim();
    case 'login':
      return 'Successful system login';
    case 'logout':
      return 'System logout';
    default:
      return `${log.action} ${entity.toLowerCase()} ${name}`.trim();
  }
}

// Generate detailed description for popup
function generateDetailedDescription(log: AuditLog): string {
  const entity = entityLabels[log.entityType] || log.entityType;
  const name = log.entityName ? `"${log.entityName}"` : '';
  const details = log.details as Record<string, unknown> | null;

  let description = '';

  switch (log.action) {
    case 'create':
      description = `Created new ${entity.toLowerCase()} ${name}`;
      if (details) {
        if (details.clientName) description += ` for client "${details.clientName}"`;
        if (details.domainName) description += `, domain: ${details.domainName}`;
        if (details.packageName) description += `, package: ${details.packageName}`;
      }
      break;
    case 'update':
      description = `Updated ${entity.toLowerCase()} ${name}`;
      if (details) {
        const changes: string[] = [];
        if (details.changes && typeof details.changes === 'object') {
          const changeObj = details.changes as Record<string, unknown>;
          Object.keys(changeObj).forEach(key => {
            changes.push(key);
          });
        }
        // Check for common field changes
        if (details.oldStatus && details.newStatus) {
          changes.push(`status: ${details.oldStatus} → ${details.newStatus}`);
        }
        if (details.oldExpiry && details.newExpiry) {
          changes.push(`expiry: ${details.oldExpiry} → ${details.newExpiry}`);
        }
        if (changes.length > 0) {
          description += `. Changed: ${changes.join(', ')}`;
        }
      }
      break;
    case 'delete':
      description = `Deleted ${entity.toLowerCase()} ${name}`;
      if (details?.clientName) description += ` (client: ${details.clientName})`;
      break;
    case 'login':
      description = `User ${log.userName} successfully logged in`;
      break;
    case 'logout':
      description = `User ${log.userName} logged out`;
      break;
    default:
      description = `${log.action} ${entity.toLowerCase()} ${name}`;
  }

  return description.trim();
}

// Extract client and domain info from log
function extractClientDomain(log: AuditLog): { client: string | null; domain: string | null } {
  const details = log.details as Record<string, unknown> | null;

  // For client entity type
  if (log.entityType === 'client') {
    return { client: log.entityName, domain: null };
  }

  // For domain entity type
  if (log.entityType === 'domain') {
    return {
      client: details?.clientName as string || null,
      domain: log.entityName
    };
  }

  // For hosting/mail
  if (log.entityType === 'hosting' || log.entityType === 'mail') {
    return {
      client: details?.clientName as string || null,
      domain: details?.domainName as string || log.entityName
    };
  }

  return { client: null, domain: null };
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Column resize state
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const resizingRef = useRef<{ column: keyof typeof DEFAULT_COLUMN_WIDTHS; startX: number; startWidth: number } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Handle column resize
  const handleResizeStart = useCallback((column: keyof typeof DEFAULT_COLUMN_WIDTHS, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      column,
      startX: e.clientX,
      startWidth: columnWidths[column],
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columnWidths]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;

      const diff = e.clientX - resizingRef.current.startX;
      const newWidth = Math.max(50, resizingRef.current.startWidth + diff);

      setColumnWidths(prev => ({
        ...prev,
        [resizingRef.current!.column]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, debouncedSearchTerm, entityTypeFilter, actionFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '50');
      if (debouncedSearchTerm) params.set('search', debouncedSearchTerm);
      if (entityTypeFilter) params.set('entityType', entityTypeFilter);
      if (actionFilter) params.set('action', actionFilter);
      return api.get<PaginatedResponse>(`/api/audit?${params.toString()}`);
    },
  });

  const { data: entityTypesData } = useQuery({
    queryKey: ['audit-entity-types'],
    queryFn: () => api.get<{ entityTypes: string[] }>('/api/audit/entity-types'),
  });

  const { data: actionsData } = useQuery({
    queryKey: ['audit-actions'],
    queryFn: () => api.get<{ actions: string[] }>('/api/audit/actions'),
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // ESC key handler for modal
  useEffect(() => {
    if (!selectedLog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedLog(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedLog]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
        {t('nav.auditLog')}
      </h1>

      <div className="card card-flush overflow-hidden">
        <div className="flex flex-wrap gap-2 items-center px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder={t('common.searchPlaceholder')}
              className="input input-sm text-xs w-full pl-7"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn btn-secondary btn-sm flex items-center gap-1 ${showFilters ? 'bg-primary-100 dark:bg-primary-900' : ''}`}
          >
            <Filter className="w-3 h-3" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <select
              value={entityTypeFilter}
              onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }}
              className="input input-sm text-xs w-auto"
            >
              <option value="">All types</option>
              {entityTypesData?.entityTypes.map((type) => (
                <option key={type} value={type}>
                  {entityLabels[type] || type}
                </option>
              ))}
            </select>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="input input-sm text-xs w-auto"
            >
              <option value="">All actions</option>
              {actionsData?.actions.map((action) => (
                <option key={action} value={action}>
                  {actionLabels[action] || action}
                </option>
              ))}
            </select>
            {(entityTypeFilter || actionFilter) && (
              <button
                onClick={() => { setEntityTypeFilter(''); setActionFilter(''); setPage(1); }}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                Reset
              </button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
          </div>
        ) : data?.logs.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-500">
            {t('common.noResults')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table ref={tableRef} className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400 relative" style={{ width: columnWidths.time }}>
                      Time
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-400 group"
                        onMouseDown={(e) => handleResizeStart('time', e)}
                      >
                        <div className="absolute right-0 top-1 bottom-1 w-0.5 bg-gray-300 dark:bg-gray-600 group-hover:bg-primary-500" />
                      </div>
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400 relative" style={{ width: columnWidths.user }}>
                      User
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-400 group"
                        onMouseDown={(e) => handleResizeStart('user', e)}
                      >
                        <div className="absolute right-0 top-1 bottom-1 w-0.5 bg-gray-300 dark:bg-gray-600 group-hover:bg-primary-500" />
                      </div>
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400 relative" style={{ width: columnWidths.email }}>
                      Email
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-400 group"
                        onMouseDown={(e) => handleResizeStart('email', e)}
                      >
                        <div className="absolute right-0 top-1 bottom-1 w-0.5 bg-gray-300 dark:bg-gray-600 group-hover:bg-primary-500" />
                      </div>
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400 relative" style={{ width: columnWidths.action }}>
                      Action
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-400 group"
                        onMouseDown={(e) => handleResizeStart('action', e)}
                      >
                        <div className="absolute right-0 top-1 bottom-1 w-0.5 bg-gray-300 dark:bg-gray-600 group-hover:bg-primary-500" />
                      </div>
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400 relative" style={{ width: columnWidths.client }}>
                      Client
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-400 group"
                        onMouseDown={(e) => handleResizeStart('client', e)}
                      >
                        <div className="absolute right-0 top-1 bottom-1 w-0.5 bg-gray-300 dark:bg-gray-600 group-hover:bg-primary-500" />
                      </div>
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400 relative" style={{ width: columnWidths.domain }}>
                      Domain
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-400 group"
                        onMouseDown={(e) => handleResizeStart('domain', e)}
                      >
                        <div className="absolute right-0 top-1 bottom-1 w-0.5 bg-gray-300 dark:bg-gray-600 group-hover:bg-primary-500" />
                      </div>
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400" style={{ width: columnWidths.description }}>
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data?.logs.map((log) => {
                    const { client, domain } = extractClientDomain(log);
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className="hover:bg-primary-50/50 dark:hover:bg-primary-900/20 cursor-pointer transition-colors"
                      >
                        <td className="px-2 py-1.5 whitespace-nowrap text-gray-500 dark:text-gray-400 overflow-hidden text-ellipsis" style={{ width: columnWidths.time }}>
                          {formatDate(log.createdAt)}
                        </td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 overflow-hidden text-ellipsis" style={{ width: columnWidths.user }} title={log.userName}>
                          {log.userName}
                        </td>
                        <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400 overflow-hidden text-ellipsis" style={{ width: columnWidths.email }} title={log.userEmail}>
                          {log.userEmail}
                        </td>
                        <td className="px-2 py-1.5" style={{ width: columnWidths.action }}>
                          <span className={`inline-block px-1.5 py-0.5 text-[10px] rounded font-medium ${actionColors[log.action] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                            {actionLabels[log.action] || log.action}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 overflow-hidden text-ellipsis" style={{ width: columnWidths.client }} title={client || ''}>
                          {client || '-'}
                        </td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 overflow-hidden text-ellipsis" style={{ width: columnWidths.domain }} title={domain || ''}>
                          {domain || '-'}
                        </td>
                        <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400 overflow-hidden text-ellipsis" style={{ width: columnWidths.description }}>
                          {generateDescription(log)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500">
                  {((page - 1) * 50) + 1} - {Math.min(page * 50, data.pagination.total)} / {data.pagination.total}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn btn-secondary btn-xs disabled:opacity-50"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <span className="text-xs text-gray-500 px-2">
                    {page} / {data.pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={page === data.pagination.totalPages}
                    className="btn btn-secondary btn-xs disabled:opacity-50"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLog(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">Event details</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(80vh-120px)]">
              {/* Action Badge */}
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-sm rounded font-medium ${actionColors[selectedLog.action] || 'bg-gray-100 text-gray-700'}`}>
                  {actionLabels[selectedLog.action] || selectedLog.action}
                </span>
                <span className="text-sm text-gray-500">
                  {entityLabels[selectedLog.entityType] || selectedLog.entityType}
                </span>
              </div>

              {/* Description */}
              <div>
                <div className="text-gray-500 text-xs mb-1">Description</div>
                <p className="text-gray-900 dark:text-gray-100 text-sm">
                  {generateDetailedDescription(selectedLog)}
                </p>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <User className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <div className="text-gray-500 text-xs">User</div>
                    <div className="text-gray-900 dark:text-gray-100">{selectedLog.userName}</div>
                    <div className="text-gray-500 text-xs">{selectedLog.userEmail}</div>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <div className="text-gray-500 text-xs">Time</div>
                    <div className="text-gray-900 dark:text-gray-100">{formatFullDate(selectedLog.createdAt)}</div>
                  </div>
                </div>

                {selectedLog.ipAddress && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <div className="text-gray-500 text-xs">IP Address</div>
                      <div className="text-gray-900 dark:text-gray-100 font-mono text-xs">{selectedLog.ipAddress}</div>
                    </div>
                  </div>
                )}

                {selectedLog.entityName && (
                  <div className="flex items-start gap-2">
                    <Globe className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <div className="text-gray-500 text-xs">Entity</div>
                      <div className="text-gray-900 dark:text-gray-100">{selectedLog.entityName}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* User Agent */}
              {selectedLog.userAgent && (
                <div className="flex items-start gap-2 text-sm">
                  <Monitor className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-gray-500 text-xs">User Agent</div>
                    <div className="text-gray-600 dark:text-gray-400 text-xs break-all">{selectedLog.userAgent}</div>
                  </div>
                </div>
              )}

              {/* Details JSON */}
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div>
                  <div className="text-gray-500 text-xs mb-1">Additional details</div>
                  <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto text-gray-700 dark:text-gray-300">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer with Close button */}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
