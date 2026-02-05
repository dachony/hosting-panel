import { differenceInDays, format, parseISO, addDays } from 'date-fns';

export function daysUntilExpiry(expiryDate: string): number {
  const expiry = parseISO(expiryDate);
  const today = new Date();
  return differenceInDays(expiry, today);
}

export function isExpiringSoon(expiryDate: string, daysBefore: number[]): boolean {
  const days = daysUntilExpiry(expiryDate);
  return daysBefore.includes(days);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}

export function formatDateDisplay(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd.MM.yyyy');
}

export function getExpiringInRange(expiryDate: string, minDays: number, maxDays: number): boolean {
  const days = daysUntilExpiry(expiryDate);
  return days >= minDays && days <= maxDays;
}

export function addDaysToDate(date: string | Date, days: number): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(addDays(d, days), 'yyyy-MM-dd');
}

export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

// Domain/hosting status types based on days until expiry
export type DomainStatus = 'green' | 'yellow' | 'orange' | 'red' | 'forDeletion' | 'deleted';

export function getDomainStatus(daysUntilExpiry: number): DomainStatus {
  if (daysUntilExpiry <= -60) return 'deleted';      // 60+ days AFTER expiry - will be deleted
  if (daysUntilExpiry <= -30) return 'forDeletion';  // 30-60 days AFTER expiry - for deletion
  if (daysUntilExpiry <= 0) return 'red';            // expired (0-30 days after)
  if (daysUntilExpiry <= 7) return 'orange';         // critical (1-7 days left)
  if (daysUntilExpiry <= 31) return 'yellow';        // warning (8-31 days left)
  return 'green';                                     // OK (31+ days left)
}
