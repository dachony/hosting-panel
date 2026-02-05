import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Loader2, Cpu, HardDrive, Database, Server, Clock, RefreshCw, Users, Globe, Mail, FileText, ScrollText, Trash2, Download } from 'lucide-react';

interface SystemStatus {
  cpu: {
    model: string;
    cores: number;
    usage: number;
    loadAvg: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  system: {
    platform: string;
    arch: string;
    hostname: string;
    uptime: number;
    nodeVersion: string;
  };
  database: {
    size: number;
    clients: number;
    domains: number;
    hosting: number;
    users: number;
    templates: number;
    auditLogs: number;
    auditLogsSize: number;
  };
}

interface AuditStats {
  total: number;
  estimatedSize: number;
  oldestLog: string | null;
  newestLog: string | null;
  olderThan30Days: number;
  olderThan90Days: number;
  olderThan1Year: number;
}

interface EmailStats {
  total: number;
  estimatedSize: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(' ') || '< 1m';
}

function ProgressBar({ value, color = 'primary' }: { value: number; color?: 'primary' | 'green' | 'yellow' | 'red' }) {
  const colorClasses = {
    primary: 'bg-primary-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };

  const getColor = () => {
    if (value > 90) return colorClasses.red;
    if (value > 70) return colorClasses.yellow;
    return colorClasses.green;
  };

  return (
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
      <div
        className={`h-2.5 rounded-full transition-all ${color === 'primary' ? colorClasses.primary : getColor()}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

function StatCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-primary-600" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function SystemStatusPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmDeleteAudit, setConfirmDeleteAudit] = useState<number | null>(null);
  const [confirmDeleteEmails, setConfirmDeleteEmails] = useState<number | null>(null);

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => api.get<SystemStatus>('/api/system/status'),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const { data: auditStats } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: () => api.get<AuditStats>('/api/audit/stats'),
  });

  const { data: emailStats } = useQuery({
    queryKey: ['email-stats'],
    queryFn: () => api.get<EmailStats>('/api/system/emails/stats'),
  });

  const deleteAuditMutation = useMutation({
    mutationFn: (days: number) => api.delete(`/api/audit/old?days=${days}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-stats'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
      setConfirmDeleteAudit(null);
    },
  });

  const deleteEmailsMutation = useMutation({
    mutationFn: (days: number) => api.delete(`/api/system/emails?days=${days}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-stats'] });
      setConfirmDeleteEmails(null);
    },
  });

  const handleExportAudit = async (format: 'json' | 'csv', days?: number) => {
    try {
      const url = days
        ? `/api/audit/export?format=${format}&days=${days}`
        : `/api/audit/export?format=${format}`;

      const token = localStorage.getItem('token');
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('en-US') : '-';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('systemStatus.title')}
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {t('systemStatus.lastUpdate')} {lastUpdate}
          </span>
          <button
            onClick={() => refetch()}
            className="btn btn-secondary !py-1.5 !px-3 !text-sm flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('systemStatus.refresh')}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* CPU */}
          <StatCard title={t('systemStatus.cpu')} icon={Cpu}>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">{t('systemStatus.usage')}</span>
                  <span className="font-medium">{data.cpu.usage.toFixed(1)}%</span>
                </div>
                <ProgressBar value={data.cpu.usage} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">{t('systemStatus.cores')}</span>
                  <span className="ml-2 font-medium">{data.cpu.cores}</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('systemStatus.load')}</span>
                  <span className="ml-2 font-medium">{data.cpu.loadAvg[0]}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 truncate" title={data.cpu.model}>
                {data.cpu.model}
              </div>
            </div>
          </StatCard>

          {/* Memory */}
          <StatCard title={t('systemStatus.memory')} icon={Server}>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">{t('systemStatus.usage')}</span>
                  <span className="font-medium">{data.memory.usagePercent.toFixed(1)}%</span>
                </div>
                <ProgressBar value={data.memory.usagePercent} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">{t('systemStatus.total')}</span>
                  <span className="ml-2 font-medium">{formatBytes(data.memory.total)}</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('systemStatus.used')}</span>
                  <span className="ml-2 font-medium">{formatBytes(data.memory.used)}</span>
                </div>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">{t('systemStatus.free')}</span>
                <span className="ml-2 font-medium text-green-600">{formatBytes(data.memory.free)}</span>
              </div>
            </div>
          </StatCard>

          {/* Disk */}
          <StatCard title={t('systemStatus.disk')} icon={HardDrive}>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">{t('systemStatus.usage')}</span>
                  <span className="font-medium">{data.disk.usagePercent.toFixed(1)}%</span>
                </div>
                <ProgressBar value={data.disk.usagePercent} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">{t('systemStatus.total')}</span>
                  <span className="ml-2 font-medium">{formatBytes(data.disk.total)}</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('systemStatus.used')}</span>
                  <span className="ml-2 font-medium">{formatBytes(data.disk.used)}</span>
                </div>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">{t('systemStatus.free')}</span>
                <span className="ml-2 font-medium text-green-600">{formatBytes(data.disk.free)}</span>
              </div>
            </div>
          </StatCard>

          {/* Database */}
          <StatCard title={t('systemStatus.database')} icon={Database}>
            <div className="space-y-3">
              <div className="text-sm">
                <span className="text-gray-500">{t('systemStatus.size')}</span>
                <span className="ml-2 font-medium">{formatBytes(data.database.size)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-500">{t('systemStatus.clients')}</span>
                  <span className="font-medium">{data.database.clients}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-500">{t('systemStatus.domains')}</span>
                  <span className="font-medium">{data.database.domains}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-500">{t('systemStatus.hosting')}</span>
                  <span className="font-medium">{data.database.hosting}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-500">{t('systemStatus.users')}</span>
                  <span className="font-medium">{data.database.users}</span>
                </div>
                <div className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-500">{t('systemStatus.templates')}</span>
                  <span className="font-medium">{data.database.templates}</span>
                </div>
                <div className="flex items-center gap-1">
                  <ScrollText className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-500">{t('systemStatus.audit')}</span>
                  <span className="font-medium">{data.database.auditLogs}</span>
                </div>
              </div>
            </div>
          </StatCard>

          {/* System Info */}
          <StatCard title={t('systemStatus.system')} icon={Server}>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500">{t('systemStatus.platform')}</span>
                <span className="ml-2 font-medium">{data.system.platform} ({data.system.arch})</span>
              </div>
              <div>
                <span className="text-gray-500">{t('systemStatus.hostname')}</span>
                <span className="ml-2 font-medium">{data.system.hostname}</span>
              </div>
              <div>
                <span className="text-gray-500">{t('systemStatus.nodeJs')}</span>
                <span className="ml-2 font-medium">{data.system.nodeVersion}</span>
              </div>
            </div>
          </StatCard>

          {/* Uptime */}
          <StatCard title={t('systemStatus.uptime')} icon={Clock}>
            <div className="flex items-center justify-center py-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary-600">
                  {formatUptime(data.system.uptime)}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {t('systemStatus.systemActive')}
                </div>
              </div>
            </div>
          </StatCard>

          {/* Audit Logs */}
          <StatCard title={t('systemStatus.auditLogs')} icon={ScrollText}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">{t('systemStatus.total')}</span>
                  <span className="ml-2 font-medium">{auditStats?.total || data.database.auditLogs}</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('systemStatus.size')}</span>
                  <span className="ml-2 font-medium">{formatBytes(auditStats?.estimatedSize || data.database.auditLogsSize)}</span>
                </div>
              </div>
              {auditStats && (
                <div className="text-xs text-gray-500 space-y-1">
                  <div>{t('systemStatus.olderThan30Days')} {auditStats.olderThan30Days}</div>
                  <div>{t('systemStatus.olderThan90Days')} {auditStats.olderThan90Days}</div>
                  <div>{t('systemStatus.olderThan1Year')} {auditStats.olderThan1Year}</div>
                </div>
              )}

              {/* Export */}
              <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="relative group">
                  <button className="btn btn-secondary !py-1 !px-2 !text-xs flex items-center gap-1">
                    <Download className="w-3 h-3" />
                    {t('systemStatus.export')}
                  </button>
                  <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 rounded shadow-lg border border-gray-200 dark:border-gray-700 hidden group-hover:block z-10">
                    <button
                      onClick={() => handleExportAudit('json')}
                      className="block w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {t('systemStatus.jsonAll')}
                    </button>
                    <button
                      onClick={() => handleExportAudit('csv')}
                      className="block w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {t('systemStatus.csvAll')}
                    </button>
                    <button
                      onClick={() => handleExportAudit('json', 30)}
                      className="block w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {t('systemStatus.json30Days')}
                    </button>
                    <button
                      onClick={() => handleExportAudit('csv', 30)}
                      className="block w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {t('systemStatus.csv30Days')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Delete Logs */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-1.5 mb-2">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs font-medium text-gray-500 uppercase">{t('systemStatus.deleteLogs')}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: t('systemStatus.olderThan1Month'), days: 30 },
                    { label: t('systemStatus.olderThan3Months'), days: 90 },
                    { label: t('systemStatus.olderThan6Months'), days: 180 },
                    { label: t('systemStatus.olderThan12Months'), days: 365 },
                    { label: t('common.all'), days: 0 },
                  ].map(({ label, days }) => (
                    confirmDeleteAudit === days ? (
                      <div key={days} className="flex items-center gap-1">
                        <button
                          onClick={() => deleteAuditMutation.mutate(days)}
                          disabled={deleteAuditMutation.isPending}
                          className="!py-0.5 !px-2 !text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                          {deleteAuditMutation.isPending ? t('systemStatus.deleting') : t('common.confirm')}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteAudit(null)}
                          className="!py-0.5 !px-1.5 !text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        key={days}
                        onClick={() => setConfirmDeleteAudit(days)}
                        className={`!py-0.5 !px-2 !text-xs rounded border transition-colors ${
                          days === 0
                            ? 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/50 dark:text-red-400 dark:hover:bg-red-500/10'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  ))}
                </div>
              </div>
            </div>
          </StatCard>

          {/* Email Logs */}
          <StatCard title={t('systemStatus.emailLogs')} icon={Mail}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">{t('systemStatus.total')}</span>
                  <span className="ml-2 font-medium">{emailStats?.total || 0}</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('systemStatus.size')}</span>
                  <span className="ml-2 font-medium">{formatBytes(emailStats?.estimatedSize || 0)}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {t('systemStatus.emailsStoredInDb')}
              </div>

              {/* Delete Logs */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-1.5 mb-2">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs font-medium text-gray-500 uppercase">{t('systemStatus.deleteLogs')}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: t('systemStatus.olderThan1Month'), days: 30 },
                    { label: t('systemStatus.olderThan3Months'), days: 90 },
                    { label: t('systemStatus.olderThan6Months'), days: 180 },
                    { label: t('systemStatus.olderThan12Months'), days: 365 },
                    { label: t('common.all'), days: 0 },
                  ].map(({ label, days }) => (
                    confirmDeleteEmails === days ? (
                      <div key={days} className="flex items-center gap-1">
                        <button
                          onClick={() => deleteEmailsMutation.mutate(days)}
                          disabled={deleteEmailsMutation.isPending}
                          className="!py-0.5 !px-2 !text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                          {deleteEmailsMutation.isPending ? t('systemStatus.deleting') : t('common.confirm')}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteEmails(null)}
                          className="!py-0.5 !px-1.5 !text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        key={days}
                        onClick={() => setConfirmDeleteEmails(days)}
                        disabled={!emailStats?.total}
                        className={`!py-0.5 !px-2 !text-xs rounded border transition-colors ${
                          days === 0
                            ? 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/50 dark:text-red-400 dark:hover:bg-red-500/10'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        {label}
                      </button>
                    )
                  ))}
                </div>
              </div>
            </div>
          </StatCard>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          {t('systemStatus.errorLoading')}
        </div>
      )}

    </div>
  );
}
