/**
 * Safe parseInt that returns null for invalid/NaN values
 */
export function safeParseInt(value: string | undefined, defaultValue?: number): number | null {
  if (value === undefined || value === '') return defaultValue ?? null;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || !isFinite(parsed)) return defaultValue ?? null;
  return parsed;
}

/**
 * Parse and validate a route :id parameter. Returns number or null.
 */
export function parseId(value: string): number | null {
  const id = parseInt(value, 10);
  if (isNaN(id) || id < 1 || !isFinite(id)) return null;
  return id;
}

/**
 * Validate ISO date string format (YYYY-MM-DD)
 */
export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value));
}

/**
 * Escape special characters in LIKE patterns to prevent injection
 */
export function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}
