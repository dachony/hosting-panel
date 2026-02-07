import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { DashboardStats, ExpiringItem, ExpiryStatus } from '../types';
import { Users, Globe, Loader2, Plus, UserPlus, FileWarning } from 'lucide-react';

// Format date for display: YYYY-MM-DD -> DD.MM.YYYY
function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '-';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}.${month}.${year}`;
}

function getExpiryStatus(days: number): ExpiryStatus {
  if (days <= -60) return 'deleted';
  if (days <= -30) return 'forDeletion';
  if (days <= 0) return 'red';
  if (days <= 7) return 'orange';
  if (days <= 31) return 'yellow';
  return 'green';
}

const statusColors: Record<ExpiryStatus, { dot: string; text: string }> = {
  green: { dot: 'bg-green-500', text: 'text-green-600 dark:text-green-400' },
  yellow: { dot: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' },
  orange: { dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  red: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  forDeletion: { dot: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400' },
  deleted: { dot: 'bg-gray-500', text: 'text-gray-600 dark:text-gray-400' },
};

function StatusBadge({ days }: { days: number }) {
  const { t } = useTranslation();
  const status = getExpiryStatus(days);
  const config = statusColors[status];

  let label: string;
  if (status === 'deleted') label = t('common.statusDeleted');
  else if (status === 'forDeletion') label = t('common.statusForDeletion');
  else if (days <= 0) label = t('common.statusExpired');
  else if (status === 'green') label = t('common.statusOk');
  else label = t('common.statusExpiring');

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

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<{ stats: DashboardStats }>('/api/dashboard/stats'),
  });

  const { data: expiringData, isLoading: expiringLoading } = useQuery({
    queryKey: ['dashboard-expiring'],
    queryFn: () => api.get<{ items: ExpiringItem[] }>('/api/dashboard/expiring?days=30'),
  });

  const { data: expiredData, isLoading: expiredLoading } = useQuery({
    queryKey: ['dashboard-expired'],
    queryFn: () => api.get<{ items: ExpiringItem[] }>('/api/dashboard/expired'),
  });

  const { data: forDeletionData, isLoading: forDeletionLoading } = useQuery({
    queryKey: ['dashboard-for-deletion'],
    queryFn: () => api.get<{ items: ExpiringItem[] }>('/api/dashboard/for-deletion'),
  });

  const { data: willBeDeletedData, isLoading: willBeDeletedLoading } = useQuery({
    queryKey: ['dashboard-will-be-deleted'],
    queryFn: () => api.get<{ items: ExpiringItem[] }>('/api/dashboard/will-be-deleted'),
  });

  const stats = statsData?.stats;
  const expiringItems = expiringData?.items || [];
  const expiredItems = expiredData?.items || [];
  const forDeletionItems = forDeletionData?.items || [];
  const willBeDeletedItems = willBeDeletedData?.items || [];

  const { data: missingOffersData, isLoading: missingOffersLoading } = useQuery({
    queryKey: ['dashboard-missing-offers'],
    queryFn: () => api.get<{ items: ExpiringItem[] }>('/api/dashboard/missing-offers'),
  });
  const missingOffers = missingOffersData?.items || [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('dashboard.title')}
      </h1>

      {/* Top section: Left (stats + actions) | Right (missing offers) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: 2x2 grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Total Clients */}
          <div
            onClick={() => navigate('/clients')}
            className="card card-compact flex items-center cursor-pointer hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 transition-all"
          >
            <div className="p-2 rounded-lg bg-blue-500 mr-3">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.totalClients')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {statsLoading ? '...' : stats?.totalClients || 0}
              </p>
            </div>
          </div>

          {/* Total Domains */}
          <div
            onClick={() => navigate('/domains')}
            className="card card-compact flex items-center cursor-pointer hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 transition-all"
          >
            <div className="p-2 rounded-lg bg-green-500 mr-3">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.totalActiveDomains')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {statsLoading ? '...' : stats?.totalActiveDomains || 0}
              </p>
            </div>
          </div>

          {/* Add Client */}
          <div
            onClick={() => navigate('/clients?add=true')}
            className="card card-compact flex items-center cursor-pointer hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 transition-all"
          >
            <div className="p-2 rounded-lg bg-primary-500 mr-3">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.quickAction')}</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('dashboard.addClient')}</p>
            </div>
          </div>

          {/* Add Domain */}
          <div
            onClick={() => navigate('/domains?add=true')}
            className="card card-compact flex items-center cursor-pointer hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 transition-all"
          >
            <div className="p-2 rounded-lg bg-emerald-500 mr-3">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.quickAction')}</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('dashboard.addDomain')}</p>
            </div>
          </div>
        </div>

        {/* Right: Missing Offers */}
        <div className="card card-flush overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20">
            <h2 className="font-semibold text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <FileWarning className="w-4 h-4" />
              {t('dashboard.missingOffers')}
            </h2>
          </div>
          {missingOffersLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
            </div>
          ) : missingOffers.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">
              {t('dashboard.noMissingOffers')}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-44 overflow-y-auto">
              {missingOffers.map((item) => (
                <div
                  key={`missing-${item.id}`}
                  onClick={() => item.domainId && navigate(`/domains/${item.domainId}`)}
                  className="flex items-center px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-xs gap-3"
                >
                  <span className="font-medium truncate w-40 shrink-0">{item.name}</span>
                  <span className="text-gray-500 dark:text-gray-400 truncate flex-1 min-w-0">{item.clientName || '-'}</span>
                  <span className="text-gray-500 dark:text-gray-400 w-24 shrink-0">{formatDateDisplay(item.expiryDate)}</span>
                  <div className="w-32 shrink-0">
                    <StatusBadge days={item.daysUntilExpiry} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2x2 Grid: Expiring | Expired / For Deletion | For Deleted */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expiring items list */}
        <div className="card card-flush overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20">
            <h2 className="font-semibold text-sm text-yellow-700 dark:text-yellow-400">
              {t('dashboard.expiringItemsNext30Days')}
            </h2>
          </div>
          {expiringLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
            </div>
          ) : expiringItems.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">
              {t('dashboard.noExpiringItems')}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-72 overflow-y-auto">
              {expiringItems.map((item) => (
                <div
                  key={`exp-${item.type}-${item.id}`}
                  onClick={() => item.domainId && navigate(`/domains/${item.domainId}`)}
                  className="flex items-center px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-xs gap-3"
                >
                  <span className="font-medium truncate w-40 shrink-0">{item.name}</span>
                  <span className="text-gray-500 dark:text-gray-400 truncate flex-1 min-w-0">{item.clientName || '-'}</span>
                  <span className="text-gray-500 dark:text-gray-400 w-24 shrink-0">{formatDateDisplay(item.expiryDate)}</span>
                  <div className="w-32 shrink-0">
                    <StatusBadge days={item.daysUntilExpiry} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expired items (0-7 days) */}
        <div className="card card-flush overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-900/20">
            <h2 className="font-semibold text-sm text-red-700 dark:text-red-400">
              {t('dashboard.expiredItems')}
            </h2>
          </div>
          {expiredLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
            </div>
          ) : expiredItems.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">
              {t('dashboard.noExpiredItems')}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-72 overflow-y-auto">
              {expiredItems.map((item) => (
                <div
                  key={`expired-${item.type}-${item.id}`}
                  onClick={() => item.domainId && navigate(`/domains/${item.domainId}`)}
                  className="flex items-center px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-xs gap-3"
                >
                  <span className="font-medium truncate w-40 shrink-0">{item.name}</span>
                  <span className="text-gray-500 dark:text-gray-400 truncate flex-1 min-w-0">{item.clientName || '-'}</span>
                  <span className="text-gray-500 dark:text-gray-400 w-24 shrink-0">{formatDateDisplay(item.expiryDate)}</span>
                  <div className="w-32 shrink-0">
                    <StatusBadge days={item.daysUntilExpiry} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* For Deletion (7-60 days) */}
        <div className="card card-flush overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-purple-50 dark:bg-purple-900/20">
            <h2 className="font-semibold text-sm text-purple-700 dark:text-purple-400">
              {t('dashboard.forDeletionItems')}
            </h2>
          </div>
          {forDeletionLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
            </div>
          ) : forDeletionItems.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">
              {t('dashboard.noForDeletionItems')}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-72 overflow-y-auto">
              {forDeletionItems.map((item) => (
                <div
                  key={`fordel-${item.type}-${item.id}`}
                  onClick={() => item.domainId && navigate(`/domains/${item.domainId}`)}
                  className="flex items-center px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-xs gap-3"
                >
                  <span className="font-medium truncate w-40 shrink-0">{item.name}</span>
                  <span className="text-gray-500 dark:text-gray-400 truncate flex-1 min-w-0">{item.clientName || '-'}</span>
                  <span className="text-gray-500 dark:text-gray-400 w-24 shrink-0">{formatDateDisplay(item.expiryDate)}</span>
                  <div className="w-32 shrink-0">
                    <StatusBadge days={item.daysUntilExpiry} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* For Deleted (60+ days) */}
        <div className="card card-flush overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700/50">
            <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-400">
              {t('dashboard.willBeDeletedExpired60')}
            </h2>
          </div>
          {willBeDeletedLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
            </div>
          ) : willBeDeletedItems.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">
              {t('dashboard.noItemsPendingDeletion')}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-72 overflow-y-auto">
              {willBeDeletedItems.map((item) => (
                <div
                  key={`delete-${item.type}-${item.id}`}
                  onClick={() => item.domainId && navigate(`/domains/${item.domainId}`)}
                  className="flex items-center px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-xs gap-3"
                >
                  <span className="font-medium truncate w-40 shrink-0">{item.name}</span>
                  <span className="text-gray-500 dark:text-gray-400 truncate flex-1 min-w-0">{item.clientName || '-'}</span>
                  <span className="text-gray-500 dark:text-gray-400 w-24 shrink-0">{formatDateDisplay(item.expiryDate)}</span>
                  <div className="w-32 shrink-0">
                    <StatusBadge days={item.daysUntilExpiry} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
