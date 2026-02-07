import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, gt, or, isNotNull } from 'drizzle-orm';
import { authMiddleware, superAdminMiddleware, AppEnv } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp } from '../utils/dates.js';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import {
  getSecuritySettings,
  getBlockedIps,
  unblockIp,
  getLoginAttempts,
  generateVerificationCode,
  storeVerificationCode,
  verifyEmailCode,
  generateBackupCodes,
  verifyBackupCode,
  getEffective2FAState,
} from '../services/security.js';
import { sendEmail } from '../services/email.js';
import { parseId, safeParseInt } from '../utils/validation.js';

const security = new Hono<AppEnv>();

security.use('*', authMiddleware);

// Get security settings
security.get('/settings', async (c) => {
  const settings = await getSecuritySettings();
  return c.json({ settings });
});

// Update security settings (admin only)
security.put('/settings', superAdminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const data = z.object({
      maxLoginAttempts: z.number().int().min(1).max(20).default(3),
      lockoutMinutes: z.number().int().min(1).max(1440).default(10),
      permanentBlockAttempts: z.number().int().min(5).max(100).default(10),
      twoFactorEnforcement: z.enum(['disabled', 'optional', 'required_admins', 'required_all']).default('optional'),
      twoFactorMethods: z.array(z.enum(['email', 'totp'])).default(['email', 'totp']),
      // Password policy
      passwordMinLength: z.number().int().min(6).max(32).default(8),
      passwordRequireUppercase: z.boolean().default(true),
      passwordRequireLowercase: z.boolean().default(true),
      passwordRequireNumbers: z.boolean().default(true),
      passwordRequireSpecial: z.boolean().default(false),
    }).parse(body);

    const existing = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'security')).get();

    if (existing) {
      await db.update(schema.appSettings)
        .set({ value: data, updatedAt: getCurrentTimestamp() })
        .where(eq(schema.appSettings.key, 'security'));
    } else {
      await db.insert(schema.appSettings).values({ key: 'security', value: data });
    }

    return c.json({ settings: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Get blocked IPs (admin only)
security.get('/blocked-ips', superAdminMiddleware, async (c) => {
  const blocked = await getBlockedIps();
  return c.json({ blocked });
});

// Unblock an IP (admin only)
security.delete('/blocked-ips/:ip', superAdminMiddleware, async (c) => {
  const ip = c.req.param('ip');
  await unblockIp(ip);
  return c.json({ message: 'IP unblocked' });
});

// Get login attempts (admin only)
security.get('/login-attempts', superAdminMiddleware, async (c) => {
  const limit = Math.max(1, Math.min(safeParseInt(c.req.query('limit'), 100) ?? 100, 1000));
  const attempts = await getLoginAttempts(limit);
  return c.json({ attempts });
});

// Get locked users (admin only)
security.get('/locked-users', superAdminMiddleware, async (c) => {
  const now = new Date().toISOString();
  const lockedUsers = await db.select({
    id: schema.users.id,
    email: schema.users.email,
    name: schema.users.name,
    lockedUntil: schema.users.lockedUntil,
    failedLoginAttempts: schema.users.failedLoginAttempts,
  })
    .from(schema.users)
    .where(
      or(
        gt(schema.users.lockedUntil, now),
        gt(schema.users.failedLoginAttempts, 0)
      )
    );

  return c.json({ lockedUsers });
});

// Unlock a user (admin only)
security.post('/unlock-user/:id', superAdminMiddleware, async (c) => {
  const userId = parseId(c.req.param('id'));
  if (userId === null) return c.json({ error: 'Invalid user ID' }, 400);

  await db.update(schema.users)
    .set({
      lockedUntil: null,
      failedLoginAttempts: 0,
      updatedAt: getCurrentTimestamp()
    })
    .where(eq(schema.users.id, userId));

  return c.json({ message: 'User unlocked' });
});

// === 2FA Endpoints ===

// Get current user's 2FA status
security.get('/2fa/status', async (c) => {
  const user = c.get('user') as { id: number };
  const dbUser = await db.select({
    twoFactorEnabled: schema.users.twoFactorEnabled,
    twoFactorMethod: schema.users.twoFactorMethod,
    twoFactorEmailEnabled: schema.users.twoFactorEmailEnabled,
    twoFactorTotpEnabled: schema.users.twoFactorTotpEnabled,
  }).from(schema.users).where(eq(schema.users.id, user.id)).get();

  if (!dbUser) {
    return c.json({ enabled: false, method: null, emailEnabled: false, totpEnabled: false });
  }

  const state = getEffective2FAState(dbUser);
  return c.json({
    enabled: state.anyEnabled,
    method: dbUser.twoFactorMethod || null,
    emailEnabled: state.emailEnabled,
    totpEnabled: state.totpEnabled,
  });
});

// Setup Email 2FA
security.post('/2fa/setup/email', async (c) => {
  const user = c.get('user') as { id: number; email: string };

  // Generate and send verification code
  const code = generateVerificationCode();
  await storeVerificationCode(user.id, code, '2fa-setup', 10);

  await sendEmail({
    to: user.email,
    subject: '2FA Setup - Verification Code',
    html: `
      <h2>2FA Setup Verification</h2>
      <p>Your verification code is: <strong style="font-size: 24px; letter-spacing: 3px;">${code}</strong></p>
      <p>This code expires in 10 minutes.</p>
    `,
  });

  return c.json({ message: 'Verification code sent to your email' });
});

// Verify and enable Email 2FA
security.post('/2fa/verify/email', async (c) => {
  const user = c.get('user') as { id: number };
  const { code } = await c.req.json();

  const valid = await verifyEmailCode(user.id, code, '2fa-setup');
  if (!valid) {
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  // Check if TOTP is already enabled — keep twoFactorMethod as 'totp' if so
  const dbUser = await db.select({
    twoFactorTotpEnabled: schema.users.twoFactorTotpEnabled,
    twoFactorMethod: schema.users.twoFactorMethod,
  }).from(schema.users).where(eq(schema.users.id, user.id)).get();

  const keepMethod = dbUser?.twoFactorTotpEnabled ? (dbUser.twoFactorMethod || 'totp') : 'email';

  // Enable email 2FA without overwriting TOTP
  await db.update(schema.users)
    .set({
      twoFactorEnabled: true,
      twoFactorEmailEnabled: true,
      twoFactorMethod: keepMethod,
      updatedAt: getCurrentTimestamp()
    })
    .where(eq(schema.users.id, user.id));

  return c.json({ message: '2FA enabled successfully', method: 'email' });
});

// Setup TOTP 2FA - Generate secret and QR code
security.post('/2fa/setup/totp', async (c) => {
  const user = c.get('user') as { id: number; email: string };

  // Get system name for the authenticator label
  const systemSetting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'system')).get();
  const systemName = (systemSetting?.value as any)?.systemName || 'Hosting Panel';

  // Generate secret
  const secret = authenticator.generateSecret();

  // Store secret temporarily (will be confirmed when user verifies)
  await db.update(schema.users)
    .set({ twoFactorSecret: secret, updatedAt: getCurrentTimestamp() })
    .where(eq(schema.users.id, user.id));

  // Generate QR code
  const otpauth = authenticator.keyuri(user.email, systemName, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  return c.json({
    secret,
    qrCode: qrCodeDataUrl,
    manualEntry: secret,
  });
});

// Verify and enable TOTP 2FA
security.post('/2fa/verify/totp', async (c) => {
  const user = c.get('user') as { id: number };
  const { code } = await c.req.json();

  // Get user's secret
  const dbUser = await db.select({ secret: schema.users.twoFactorSecret })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get();

  if (!dbUser?.secret) {
    return c.json({ error: 'TOTP not set up. Please start setup again.' }, 400);
  }

  // Verify code
  const valid = authenticator.verify({ token: code, secret: dbUser.secret });
  if (!valid) {
    return c.json({ error: 'Invalid code' }, 400);
  }

  // Enable TOTP 2FA — TOTP is always primary method when enabled
  await db.update(schema.users)
    .set({
      twoFactorEnabled: true,
      twoFactorTotpEnabled: true,
      twoFactorMethod: 'totp',
      updatedAt: getCurrentTimestamp()
    })
    .where(eq(schema.users.id, user.id));

  const backupCodes = await generateBackupCodes(user.id);

  return c.json({
    message: '2FA enabled successfully',
    method: 'totp',
    backupCodes,
  });
});

// Disable 2FA (per-method or all)
security.post('/2fa/disable', async (c) => {
  const user = c.get('user') as { id: number };
  const body = await c.req.json();
  const { password, method } = body as { password: string; method?: 'email' | 'totp' };

  // Verify password
  const dbUser = await db.select({
    passwordHash: schema.users.passwordHash,
    twoFactorEmailEnabled: schema.users.twoFactorEmailEnabled,
    twoFactorTotpEnabled: schema.users.twoFactorTotpEnabled,
  }).from(schema.users).where(eq(schema.users.id, user.id)).get();

  if (!dbUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  const bcrypt = await import('bcryptjs');
  const validPassword = await bcrypt.compare(password, dbUser.passwordHash);
  if (!validPassword) {
    return c.json({ error: 'Invalid password' }, 401);
  }

  if (method === 'email') {
    // Disable only email 2FA
    const totpStillEnabled = !!dbUser.twoFactorTotpEnabled;
    await db.update(schema.users)
      .set({
        twoFactorEmailEnabled: false,
        twoFactorEnabled: totpStillEnabled,
        twoFactorMethod: totpStillEnabled ? 'totp' : null,
        updatedAt: getCurrentTimestamp()
      })
      .where(eq(schema.users.id, user.id));
  } else if (method === 'totp') {
    // Disable only TOTP 2FA
    const emailStillEnabled = !!dbUser.twoFactorEmailEnabled;
    await db.update(schema.users)
      .set({
        twoFactorTotpEnabled: false,
        twoFactorSecret: null,
        twoFactorEnabled: emailStillEnabled,
        twoFactorMethod: emailStillEnabled ? 'email' : null,
        updatedAt: getCurrentTimestamp()
      })
      .where(eq(schema.users.id, user.id));
    // Delete backup codes (they belong to TOTP)
    await db.delete(schema.backupCodes).where(eq(schema.backupCodes.userId, user.id));
  } else {
    // Legacy: disable all 2FA
    await db.update(schema.users)
      .set({
        twoFactorEnabled: false,
        twoFactorEmailEnabled: false,
        twoFactorTotpEnabled: false,
        twoFactorMethod: null,
        twoFactorSecret: null,
        updatedAt: getCurrentTimestamp()
      })
      .where(eq(schema.users.id, user.id));
    await db.delete(schema.backupCodes).where(eq(schema.backupCodes.userId, user.id));
  }

  return c.json({ message: '2FA disabled' });
});

// Regenerate backup codes
security.post('/2fa/backup-codes/regenerate', async (c) => {
  const user = c.get('user') as { id: number };

  // Check if TOTP 2FA is enabled
  const dbUser = await db.select({
    twoFactorTotpEnabled: schema.users.twoFactorTotpEnabled,
    twoFactorEnabled: schema.users.twoFactorEnabled,
    twoFactorMethod: schema.users.twoFactorMethod,
  })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get();

  const state = getEffective2FAState(dbUser || {});
  if (!state.totpEnabled) {
    return c.json({ error: 'TOTP 2FA must be enabled' }, 400);
  }

  const backupCodes = await generateBackupCodes(user.id);
  return c.json({ backupCodes });
});

export default security;
