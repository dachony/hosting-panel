const localeMap: Record<string, string> = {
  sr: 'sr-Latn-RS',
  en: 'en-GB',
};

function getLocale(language?: string): string {
  return localeMap[language || 'sr'] || 'sr-Latn-RS';
}

/** Format date-only string (YYYY-MM-DD) for display: DD.MM.YYYY */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}.${month}.${year}`;
}

/** Format ISO/SQLite timestamp for short display (DD.MM.YY, HH:MM) */
export function formatDateTime(dateStr: string, language?: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(getLocale(language), {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format ISO/SQLite timestamp for full display (DD.MM.YYYY, HH:MM:SS) */
export function formatDateTimeFull(dateStr: string, language?: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(getLocale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
