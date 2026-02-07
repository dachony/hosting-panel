import { db, schema } from '../db/index.js';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getCurrentTimestamp } from '../utils/dates.js';
import crypto from 'crypto';
import { notifyFailedLoginAttempts } from './systemNotifications.js';

// Default security settings
const DEFAULT_SETTINGS = {
  maxLoginAttempts: 3,
  lockoutMinutes: 10,
  permanentBlockAttempts: 10,
  // 2FA enforcement: 'disabled' | 'optional' | 'required_admins' | 'required_all'
  twoFactorEnforcement: 'optional' as string,
  twoFactorMethods: ['email', 'totp'] as string[],
  // Password policy
  passwordMinLength: 6,
  passwordRequireUppercase: true,
  passwordRequireLowercase: true,
  passwordRequireNumbers: true,
  passwordRequireSpecial: false,
};

// Get security settings from database
export async function getSecuritySettings() {
  const setting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'security')).get();
  if (setting?.value) {
    return { ...DEFAULT_SETTINGS, ...(setting.value as object) };
  }
  return DEFAULT_SETTINGS;
}

// Validate password against policy
export async function validatePassword(password: string): Promise<{ valid: boolean; errors: string[] }> {
  const settings = await getSecuritySettings();
  const errors: string[] = [];

  if (password.length < settings.passwordMinLength) {
    errors.push(`Password must be at least ${settings.passwordMinLength} characters`);
  }

  if (settings.passwordRequireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (settings.passwordRequireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (settings.passwordRequireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (settings.passwordRequireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return { valid: errors.length === 0, errors };
}

// Generate temporary password that meets policy requirements
export async function generateTemporaryPassword(): Promise<string> {
  const settings = await getSecuritySettings();
  const length = Math.max(settings.passwordMinLength, 12);

  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*';

  let chars = '';
  let password = '';

  // Add required character types
  if (settings.passwordRequireUppercase) {
    chars += uppercase;
    password += uppercase[crypto.randomInt(uppercase.length)];
  }
  if (settings.passwordRequireLowercase) {
    chars += lowercase;
    password += lowercase[crypto.randomInt(lowercase.length)];
  }
  if (settings.passwordRequireNumbers) {
    chars += numbers;
    password += numbers[crypto.randomInt(numbers.length)];
  }
  if (settings.passwordRequireSpecial) {
    chars += special;
    password += special[crypto.randomInt(special.length)];
  }

  // If no requirements, use all
  if (!chars) {
    chars = uppercase + lowercase + numbers;
  }

  // Fill rest of password
  while (password.length < length) {
    password += chars[crypto.randomInt(chars.length)];
  }

  // Shuffle password
  return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

// Check if IP is blocked
export async function isIpBlocked(ipAddress: string): Promise<{ blocked: boolean; reason?: string; until?: string }> {
  const blocked = await db.select()
    .from(schema.blockedIps)
    .where(eq(schema.blockedIps.ipAddress, ipAddress))
    .get();

  if (!blocked) {
    return { blocked: false };
  }

  // Check if permanent block
  if (blocked.permanent) {
    return { blocked: true, reason: blocked.reason || 'Permanently blocked', until: 'permanent' };
  }

  // Check if temporary block has expired
  if (blocked.blockedUntil) {
    const blockedUntil = new Date(blocked.blockedUntil);
    if (blockedUntil > new Date()) {
      return { blocked: true, reason: blocked.reason || 'Too many failed attempts', until: blocked.blockedUntil };
    } else {
      // Block expired, remove it
      await db.delete(schema.blockedIps).where(eq(schema.blockedIps.id, blocked.id));
      return { blocked: false };
    }
  }

  return { blocked: false };
}

// Record login attempt
export async function recordLoginAttempt(ipAddress: string, email: string | null, success: boolean, userAgent?: string) {
  await db.insert(schema.loginAttempts).values({
    ipAddress,
    email,
    success,
    userAgent,
  });

  // If failed, check if we need to block
  if (!success) {
    await checkAndBlockIp(ipAddress);
  }
}

// Format date as SQLite-compatible timestamp (YYYY-MM-DD HH:MM:SS)
function toSqliteTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

// Check failed attempts and block if needed
async function checkAndBlockIp(ipAddress: string) {
  const settings = await getSecuritySettings();
  const windowStart = toSqliteTimestamp(new Date(Date.now() - settings.lockoutMinutes * 60 * 1000));

  // Count recent failed attempts
  const recentAttempts = await db.select({ count: sql<number>`count(*)` })
    .from(schema.loginAttempts)
    .where(
      and(
        eq(schema.loginAttempts.ipAddress, ipAddress),
        eq(schema.loginAttempts.success, false),
        gte(schema.loginAttempts.createdAt, windowStart)
      )
    )
    .get();

  const failedCount = recentAttempts?.count || 0;

  // Get emails that were tried from this IP
  const attemptedEmails = await db.select({ email: schema.loginAttempts.email })
    .from(schema.loginAttempts)
    .where(
      and(
        eq(schema.loginAttempts.ipAddress, ipAddress),
        eq(schema.loginAttempts.success, false),
        gte(schema.loginAttempts.createdAt, windowStart)
      )
    );
  const emails = [...new Set(attemptedEmails.map(a => a.email).filter(Boolean) as string[])];

  // Send notification for failed login attempts
  notifyFailedLoginAttempts(ipAddress, failedCount, emails).catch(() => {});

  // Check for permanent block
  if (failedCount >= settings.permanentBlockAttempts) {
    await blockIp(ipAddress, 'Too many failed login attempts', true);
    return;
  }

  // Check for temporary block
  if (failedCount >= settings.maxLoginAttempts) {
    const blockedUntil = toSqliteTimestamp(new Date(Date.now() + settings.lockoutMinutes * 60 * 1000));
    await blockIp(ipAddress, 'Too many failed login attempts', false, blockedUntil);
  }
}

// Block an IP
export async function blockIp(ipAddress: string, reason: string, permanent: boolean, blockedUntil?: string) {
  const existing = await db.select().from(schema.blockedIps).where(eq(schema.blockedIps.ipAddress, ipAddress)).get();

  if (existing) {
    await db.update(schema.blockedIps)
      .set({ reason, permanent, blockedUntil, createdAt: getCurrentTimestamp() })
      .where(eq(schema.blockedIps.id, existing.id));
  } else {
    await db.insert(schema.blockedIps).values({
      ipAddress,
      reason,
      permanent,
      blockedUntil,
    });
  }
}

// Unblock an IP
export async function unblockIp(ipAddress: string) {
  await db.delete(schema.blockedIps).where(eq(schema.blockedIps.ipAddress, ipAddress));
}

// Get all blocked IPs
export async function getBlockedIps() {
  return db.select().from(schema.blockedIps).all();
}

// Get login attempts (for audit)
export async function getLoginAttempts(limit = 100) {
  return db.select()
    .from(schema.loginAttempts)
    .orderBy(sql`${schema.loginAttempts.createdAt} DESC`)
    .limit(limit)
    .all();
}

// Clean up old login attempts (call periodically)
export async function cleanupOldAttempts(daysToKeep = 7) {
  const cutoff = toSqliteTimestamp(new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000));
  await db.delete(schema.loginAttempts).where(sql`${schema.loginAttempts.createdAt} < ${cutoff}`);
}

// Dual 2FA helper — backward compat with legacy single-method users
export function getEffective2FAState(user: {
  twoFactorEnabled?: boolean | null;
  twoFactorMethod?: string | null;
  twoFactorEmailEnabled?: boolean | null;
  twoFactorTotpEnabled?: boolean | null;
}) {
  // New dual-2FA columns take precedence when set
  if (user.twoFactorEmailEnabled || user.twoFactorTotpEnabled) {
    return {
      emailEnabled: !!user.twoFactorEmailEnabled,
      totpEnabled: !!user.twoFactorTotpEnabled,
      anyEnabled: true,
    };
  }
  // Legacy fallback: derive from old single-method fields
  return {
    emailEnabled: !!(user.twoFactorEnabled && user.twoFactorMethod === 'email'),
    totpEnabled: !!(user.twoFactorEnabled && user.twoFactorMethod === 'totp'),
    anyEnabled: !!user.twoFactorEnabled,
  };
}

// 2FA Functions

// Generate a random 6-digit code
export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// Generate TOTP secret
export function generateTotpSecret(): string {
  return crypto.randomBytes(20).toString('base64');
}

// Store verification code for email 2FA
export async function storeVerificationCode(userId: number, code: string, type: string = 'login', expiresInMinutes: number = 10) {
  const expiresAt = toSqliteTimestamp(new Date(Date.now() + expiresInMinutes * 60 * 1000));

  // Delete any existing unused codes for this user and type
  await db.delete(schema.verificationCodes)
    .where(and(
      eq(schema.verificationCodes.userId, userId),
      eq(schema.verificationCodes.type, type),
      sql`${schema.verificationCodes.usedAt} IS NULL`
    ));

  await db.insert(schema.verificationCodes).values({
    userId,
    code,
    type,
    expiresAt,
  });
}

// Verify email code
export async function verifyEmailCode(userId: number, code: string, type: string = 'login'): Promise<boolean> {
  const stored = await db.select()
    .from(schema.verificationCodes)
    .where(and(
      eq(schema.verificationCodes.userId, userId),
      eq(schema.verificationCodes.code, code),
      eq(schema.verificationCodes.type, type),
      sql`${schema.verificationCodes.usedAt} IS NULL`
    ))
    .get();

  if (!stored) {
    return false;
  }

  // Check expiry
  if (new Date(stored.expiresAt) < new Date()) {
    return false;
  }

  // Mark as used
  await db.update(schema.verificationCodes)
    .set({ usedAt: getCurrentTimestamp() })
    .where(eq(schema.verificationCodes.id, stored.id));

  return true;
}

// Generate backup codes for TOTP
export async function generateBackupCodes(userId: number, count: number = 10): Promise<string[]> {
  // Delete existing backup codes
  await db.delete(schema.backupCodes).where(eq(schema.backupCodes.userId, userId));

  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
    await db.insert(schema.backupCodes).values({ userId, code });
  }

  return codes;
}

// Verify backup code
export async function verifyBackupCode(userId: number, code: string): Promise<boolean> {
  const stored = await db.select()
    .from(schema.backupCodes)
    .where(and(
      eq(schema.backupCodes.userId, userId),
      eq(schema.backupCodes.code, code.toUpperCase()),
      sql`${schema.backupCodes.usedAt} IS NULL`
    ))
    .get();

  if (!stored) {
    return false;
  }

  // Mark as used
  await db.update(schema.backupCodes)
    .set({ usedAt: getCurrentTimestamp() })
    .where(eq(schema.backupCodes.id, stored.id));

  return true;
}
