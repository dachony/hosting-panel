import { useTranslation } from 'react-i18next';

interface ExpiryBadgeProps {
  daysUntilExpiry: number;
  size?: 'sm' | 'md';
}

export type ExpiryStatusType = 'green' | 'yellow' | 'orange' | 'red' | 'forDeletion' | 'deleted';

export function getExpiryStatus(daysUntilExpiry: number): ExpiryStatusType {
  if (daysUntilExpiry <= -60) return 'deleted';
  if (daysUntilExpiry <= -30) return 'forDeletion';
  if (daysUntilExpiry <= 0) return 'red';
  if (daysUntilExpiry <= 7) return 'orange';
  if (daysUntilExpiry <= 31) return 'yellow';
  return 'green';
}

const statusConfig: Record<ExpiryStatusType, { dotColor: string; textColor: string; bgColor: string }> = {
  green: { dotColor: 'bg-green-500', textColor: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/50' },
  yellow: { dotColor: 'bg-yellow-500', textColor: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/50' },
  orange: { dotColor: 'bg-orange-500', textColor: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/50' },
  red: { dotColor: 'bg-red-500', textColor: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-900/50' },
  forDeletion: { dotColor: 'bg-purple-500', textColor: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/50' },
  deleted: { dotColor: 'bg-gray-500', textColor: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-700' },
};

export default function ExpiryBadge({ daysUntilExpiry, size = 'md' }: ExpiryBadgeProps) {
  const { t } = useTranslation();
  const status = getExpiryStatus(daysUntilExpiry);
  const { dotColor, textColor } = statusConfig[status];

  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const numberSize = size === 'sm' ? 'text-base' : 'text-lg';

  // Deleted status (60+ days expired)
  if (status === 'deleted') {
    return (
      <div className="flex items-center gap-2">
        <div className={`${dotSize} rounded-full ${dotColor}`}></div>
        <span className={`${textSize} font-bold ${textColor}`}>{t('common.deleted')}</span>
      </div>
    );
  }

  // For deletion status (30-60 days expired)
  if (status === 'forDeletion') {
    return (
      <div className="flex items-center gap-2">
        <div className={`${dotSize} rounded-full ${dotColor}`}></div>
        <span className={`${textSize} font-bold ${textColor}`}>{t('common.forDeletion')}</span>
      </div>
    );
  }

  // Expired status (0-30 days expired)
  if (status === 'red') {
    return (
      <div className="flex items-center gap-2">
        <div className={`${dotSize} rounded-full ${dotColor}`}></div>
        <span className={`${textSize} font-bold ${textColor}`}>{t('common.expired')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`${dotSize} rounded-full ${dotColor}`}></div>
      <div className="text-center">
        <div className={`text-xs ${textColor}`}>{t('common.daysLeft')}</div>
        <div className={`${numberSize} font-bold ${textColor} leading-tight`}>
          {daysUntilExpiry > 36000 ? '∞' : daysUntilExpiry}
        </div>
      </div>
    </div>
  );
}
