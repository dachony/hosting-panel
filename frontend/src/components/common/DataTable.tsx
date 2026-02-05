import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  isLoading?: boolean;
  actions?: (item: T) => ReactNode;
}

export default function DataTable<T>({
  data,
  columns,
  keyField,
  isLoading = false,
  actions,
}: DataTableProps<T>) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        {t('common.noData')}
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className}>
                {column.header}
              </th>
            ))}
            {actions && <th className="text-right">{t('common.actions')}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {data.map((item) => (
            <tr key={String(item[keyField])}>
              {columns.map((column) => (
                <td key={column.key} className={column.className}>
                  {column.render
                    ? column.render(item)
                    : String((item as Record<string, unknown>)[column.key] ?? '')}
                </td>
              ))}
              {actions && (
                <td className="text-right">
                  <div className="flex justify-end space-x-2">
                    {actions(item)}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
