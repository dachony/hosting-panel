import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { DashboardStats, ExpiringItem } from '../types';
import { Users, Globe, Server, AlertTriangle, Trash2, Loader2, Plus, UserPlus } from 'lucide-react';
import ExpiryBadge from '../components/common/ExpiryBadge';

// Format date for display: YYYY-MM-DD -> DD.MM.YYYY
function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '-';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}.${month}.${year}`;
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

  const statCards = [
    { label: t('dashboard.totalClients'), value: stats?.totalClients || 0, icon: Users, color: 'bg-blue-500', link: '/clients' },
    { label: t('dashboard.totalActiveDomains'), value: stats?.totalActiveDomains || 0, icon: Globe, color: 'bg-green-500', link: '/domains' },
    { label: t('dashboard.totalHosting'), value: stats?.totalHosting || 0, icon: Server, color: 'bg-purple-500', link: '/domains' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('dashboard.title')}
      </h1>

      {/* Main stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            onClick={() => navigate(card.link)}
            className="card card-compact flex items-center cursor-pointer hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 transition-all"
          >
            <div className={`p-2 rounded-lg ${card.color} mr-3`}>
              <card.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {statsLoading ? '...' : card.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions and alerts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

        <div
          onClick={() => navigate('/domains?filter=yellow,orange,red')}
          className="card card-compact flex items-center cursor-pointer hover:shadow-md hover:border-yellow-300 dark:hover:border-yellow-600 transition-all"
        >
          <AlertTriangle className="w-6 h-6 text-yellow-500 mr-3" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.expiring30Days')}</p>
            <p className={`text-lg font-bold ${(stats?.expiringHosting || 0) > 0 ? 'text-yellow-600' : 'text-gray-900 dark:text-gray-100'}`}>
              {statsLoading ? '...' : stats?.expiringHosting || 0}
            </p>
          </div>
        </div>

        <div
          onClick={() => navigate('/domains?filter=forDeletion,deleted')}
          className="card card-compact flex items-center cursor-pointer hover:shadow-md hover:border-red-300 dark:hover:border-red-600 transition-all"
        >
          <Trash2 className="w-6 h-6 text-red-500 mr-3" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.willBeDeleted')}</p>
            <p className={`text-lg font-bold ${(stats?.willBeDeletedCount || 0) > 0 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
              {statsLoading ? '...' : stats?.willBeDeletedCount || 0}
            </p>
          </div>
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
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0 text-xs">
                    <span className="font-medium truncate">{item.name}</span>
                    <span className="text-gray-500 dark:text-gray-400 truncate hidden sm:inline">{item.clientName || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateDisplay(item.expiryDate)}</span>
                    <ExpiryBadge daysUntilExpiry={item.daysUntilExpiry} size="sm" />
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
                  className="flex items-center justify-between px-3 py-2 bg-red-50/30 dark:bg-red-900/10 cursor-pointer hover:bg-red-100/50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0 text-xs">
                    <span className="font-medium truncate">{item.name}</span>
                    <span className="text-gray-500 dark:text-gray-400 truncate hidden sm:inline">{item.clientName || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateDisplay(item.expiryDate)}</span>
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 whitespace-nowrap">
                      {Math.abs(item.daysUntilExpiry)}d
                    </span>
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
                  className="flex items-center justify-between px-3 py-2 bg-purple-50/30 dark:bg-purple-900/10 cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-900/20 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0 text-xs">
                    <span className="font-medium truncate">{item.name}</span>
                    <span className="text-gray-500 dark:text-gray-400 truncate hidden sm:inline">{item.clientName || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateDisplay(item.expiryDate)}</span>
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 whitespace-nowrap">
                      {Math.abs(item.daysUntilExpiry)}d
                    </span>
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
                  className="flex items-center justify-between px-3 py-2 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0 text-xs">
                    <span className="font-medium truncate">{item.name}</span>
                    <span className="text-gray-500 dark:text-gray-400 truncate hidden sm:inline">{item.clientName || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateDisplay(item.expiryDate)}</span>
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {Math.abs(item.daysUntilExpiry)}d
                    </span>
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
