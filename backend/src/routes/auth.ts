import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, schema } from '../db/index.js';
import { eq, and, gt, count } from 'drizzle-orm';
import { generateToken, authMiddleware, AppEnv } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { z } from 'zod';
import { sendEmail } from '../services/email.js';
import { getCurrentTimestamp } from '../utils/dates.js';
import { logAudit, audit } from '../services/audit.js';
import {
  isIpBlocked,
  recordLoginAttempt,
  generateVerificationCode,
  storeVerificationCode,
  verifyEmailCode,
  verifyBackupCode,
  getSecuritySettings,
  generateBackupCodes,
  validatePassword,
  getEffective2FAState,
} from '../services/security.js';
import { authenticator } from 'otplib';
import { seedDefaults } from '../db/seed.js';

const auth = new Hono<AppEnv>();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Temporary tokens for 2FA pending sessions (in production, use Redis)
const pending2FASessions = new Map<string, { userId: number; email: string; name: string; role: string; expiresAt: number }>();

// Cleanup expired 2FA sessions every 10 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of pending2FASessions) {
    if (session.expiresAt < now) {
      pending2FASessions.delete(key);
    }
  }
}, 10 * 60 * 1000);

// Rate limit: 10 login attempts per minute per IP
auth.post('/login', rateLimit('login', 10, 60 * 1000), async (c) => {
  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';

  try {
    // Check if IP is blocked
    const blockStatus = await isIpBlocked(ipAddress);
    if (blockStatus.blocked) {
      return c.json({
        error: 'Too many failed attempts',
        blockedUntil: blockStatus.until,
        reason: blockStatus.reason
      }, 429);
    }

    const body = await c.req.json();
    const { email, password } = loginSchema.parse(body);

    const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();

    if (!user) {
      // Timing attack prevention: run bcrypt.compare with dummy hash
      // so response time matches the case where user exists but password is wrong
      await bcrypt.compare(password, '$2a$10$0000000000000000000000uDummyHashForTimingAttackPrevention.');
      await recordLoginAttempt(ipAddress, email, false, userAgent);
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);

    if (!validPassword) {
      await recordLoginAttempt(ipAddress, email, false, userAgent);
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Check if user is active
    if (user.isActive === false) {
      return c.json({ error: 'Your account is deactivated. Contact your administrator.' }, 403);
    }

    // Get security settings for 2FA enforcement
    const securitySettings = await getSecuritySettings();
    const enforcement = securitySettings.twoFactorEnforcement || 'optional';

    // Determine if 2FA is required for this user
    const is2FARequired =
      enforcement === 'required_all' ||
      (enforcement === 'required_admins' && user.role === 'admin');

    // Check if user needs to set up 2FA but hasn't
    if (is2FARequired && !user.twoFactorEnabled) {
      // Generate temporary token to allow 2FA setup
      const setupToken = crypto.randomBytes(32).toString('hex');
      pending2FASessions.set(setupToken, {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes for setup
      });

      return c.json({
        requires2FASetup: true,
        setupToken,
        message: '2FA је обавезна за ваш налог. Молимо подесите двофакторску аутентификацију.',
        availableMethods: securitySettings.twoFactorMethods || ['email', 'totp'],
      });
    }

    // Check if 2FA is enabled (or skip if enforcement is 'disabled')
    const twoFA = getEffective2FAState(user);
    if (enforcement !== 'disabled' && twoFA.anyEnabled) {
      // Generate a temporary session token
      const sessionToken = crypto.randomBytes(32).toString('hex');
      pending2FASessions.set(sessionToken, {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      // Determine primary method: TOTP takes precedence when enabled
      const primaryMethod = twoFA.totpEnabled ? 'totp' : 'email';
      const hasEmailFallback = twoFA.totpEnabled && twoFA.emailEnabled;

      // If primary method is email (only email enabled), send code immediately
      if (primaryMethod === 'email') {
        const code = generateVerificationCode();
        await storeVerificationCode(user.id, code, 'login', 5);
        await sendEmail({
          to: user.email,
          subject: 'Login Verification Code',
          html: `
            <h2>Login Verification</h2>
            <p>Your verification code is: <strong style="font-size: 24px; letter-spacing: 3px;">${code}</strong></p>
            <p>This code expires in 5 minutes.</p>
            <p style="color: #6b7280; font-size: 12px;">If you didn't try to log in, please secure your account.</p>
          `,
        });
      }
      // If primary is TOTP, do NOT send email — user can request it via fallback

      return c.json({
        requires2FA: true,
        method: primaryMethod,
        hasEmailFallback,
        sessionToken,
      });
    }

    // No 2FA, issue token directly
    await recordLoginAttempt(ipAddress, email, true, userAgent);

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Log successful login
    await db.insert(schema.auditLogs).values({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      action: 'login',
      entityType: 'auth',
      entityId: user.id,
      entityName: user.email,
      ipAddress,
      userAgent,
    });

    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      mustChangePassword: user.mustChangePassword || false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Verify 2FA code and complete login
// Rate limit: 5 attempts per minute per IP
auth.post('/login/verify-2fa', rateLimit('verify-2fa', 5, 60 * 1000), async (c) => {
  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';

  try {
    const { sessionToken, code, useBackupCode, method } = await c.req.json();

    // Get pending session
    const session = pending2FASessions.get(sessionToken);
    if (!session || session.expiresAt < Date.now()) {
      pending2FASessions.delete(sessionToken);
      return c.json({ error: 'Session expired. Please login again.' }, 401);
    }

    // Get user for verification
    const user = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    let valid = false;

    // Determine which verification method to use
    // 'method' param from frontend tells us what the user submitted
    const verifyMethod = method || user.twoFactorMethod;

    // Check backup code first if specified
    if (useBackupCode) {
      valid = await verifyBackupCode(user.id, code);
    } else if (verifyMethod === 'email') {
      valid = await verifyEmailCode(user.id, code, 'login');
    } else if (verifyMethod === 'totp' && user.twoFactorSecret) {
      valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    }

    if (!valid) {
      await recordLoginAttempt(ipAddress, user.email, false, userAgent);
      return c.json({ error: 'Invalid verification code' }, 401);
    }

    // Success - remove pending session and issue token
    pending2FASessions.delete(sessionToken);
    await recordLoginAttempt(ipAddress, user.email, true, userAgent);

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Log successful login
    await db.insert(schema.auditLogs).values({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      action: 'login',
      entityType: 'auth',
      entityId: user.id,
      entityName: user.email,
      details: { twoFactor: true, method: verifyMethod },
      ipAddress,
      userAgent,
    });

    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      mustChangePassword: user.mustChangePassword || false,
    });
  } catch (error) {
    return c.json({ error: 'Verification failed' }, 400);
  }
});

// Resend 2FA email code
auth.post('/login/resend-2fa', async (c) => {
  try {
    const { sessionToken } = await c.req.json();

    const session = pending2FASessions.get(sessionToken);
    if (!session || session.expiresAt < Date.now()) {
      return c.json({ error: 'Session expired. Please login again.' }, 401);
    }

    const user = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();
    if (!user) {
      return c.json({ error: 'Cannot resend code' }, 400);
    }

    // Check that email 2FA is enabled (new dual columns or legacy)
    const state = getEffective2FAState(user);
    if (!state.emailEnabled) {
      return c.json({ error: 'Email 2FA is not enabled' }, 400);
    }

    const code = generateVerificationCode();
    await storeVerificationCode(user.id, code, 'login', 5);
    await sendEmail({
      to: user.email,
      subject: 'Login Verification Code',
      html: `
        <h2>Login Verification</h2>
        <p>Your new verification code is: <strong style="font-size: 24px; letter-spacing: 3px;">${code}</strong></p>
        <p>This code expires in 5 minutes.</p>
      `,
    });

    // Extend session
    session.expiresAt = Date.now() + 5 * 60 * 1000;

    return c.json({ message: 'Code sent' });
  } catch (error) {
    return c.json({ error: 'Failed to resend code' }, 500);
  }
});

// Send email fallback code during TOTP login (when both methods enabled)
// Rate limit: 3 requests per minute per IP
auth.post('/login/send-email-fallback', rateLimit('email-fallback', 3, 60 * 1000), async (c) => {
  try {
    const { sessionToken } = await c.req.json();

    const session = pending2FASessions.get(sessionToken);
    if (!session || session.expiresAt < Date.now()) {
      return c.json({ error: 'Session expired. Please login again.' }, 401);
    }

    const user = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Verify email 2FA is enabled for this user
    const state = getEffective2FAState(user);
    if (!state.emailEnabled) {
      return c.json({ error: 'Email 2FA is not enabled' }, 400);
    }

    const code = generateVerificationCode();
    await storeVerificationCode(user.id, code, 'login', 5);
    await sendEmail({
      to: user.email,
      subject: 'Login Verification Code',
      html: `
        <h2>Login Verification</h2>
        <p>Your verification code is: <strong style="font-size: 24px; letter-spacing: 3px;">${code}</strong></p>
        <p>This code expires in 5 minutes.</p>
        <p style="color: #6b7280; font-size: 12px;">If you didn't try to log in, please secure your account.</p>
      `,
    });

    // Extend session
    session.expiresAt = Date.now() + 5 * 60 * 1000;

    return c.json({ message: 'Code sent' });
  } catch (error) {
    return c.json({ error: 'Failed to send code' }, 500);
  }
});

// Setup 2FA during forced setup flow (for users who must have 2FA)
auth.post('/login/setup-2fa', async (c) => {
  try {
    const { setupToken, method } = await c.req.json();

    const session = pending2FASessions.get(setupToken);
    if (!session || session.expiresAt < Date.now()) {
      pending2FASessions.delete(setupToken);
      return c.json({ error: 'Session expired. Please login again.' }, 401);
    }

    const user = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    if (method === 'email') {
      // Send verification code
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
      return c.json({ message: 'Verification code sent', method: 'email' });
    } else if (method === 'totp') {
      // Generate TOTP secret and QR
      const systemSetting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'system')).get();
      const systemName = (systemSetting?.value as any)?.systemName || 'Hosting Panel';

      const secret = authenticator.generateSecret();
      await db.update(schema.users)
        .set({ twoFactorSecret: secret, updatedAt: getCurrentTimestamp() })
        .where(eq(schema.users.id, user.id));

      const QRCode = await import('qrcode');
      const otpauth = authenticator.keyuri(user.email, systemName, secret);
      const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

      return c.json({
        method: 'totp',
        secret,
        qrCode: qrCodeDataUrl,
      });
    }

    return c.json({ error: 'Invalid method' }, 400);
  } catch (error) {
    return c.json({ error: 'Setup failed' }, 500);
  }
});

// Verify 2FA setup and complete login
// Rate limit: 5 attempts per minute per IP
auth.post('/login/verify-2fa-setup', rateLimit('verify-2fa-setup', 5, 60 * 1000), async (c) => {
  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';

  try {
    const { setupToken, code, method } = await c.req.json();

    const session = pending2FASessions.get(setupToken);
    if (!session || session.expiresAt < Date.now()) {
      pending2FASessions.delete(setupToken);
      return c.json({ error: 'Session expired. Please login again.' }, 401);
    }

    const user = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    let valid = false;

    if (method === 'email') {
      valid = await verifyEmailCode(user.id, code, '2fa-setup');
    } else if (method === 'totp' && user.twoFactorSecret) {
      valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    }

    if (!valid) {
      return c.json({ error: 'Invalid verification code' }, 401);
    }

    // Enable 2FA for user
    await db.update(schema.users)
      .set({
        twoFactorEnabled: true,
        twoFactorMethod: method,
        updatedAt: getCurrentTimestamp()
      })
      .where(eq(schema.users.id, user.id));

    // Generate backup codes for TOTP
    let backupCodes: string[] | undefined;
    if (method === 'totp') {
      backupCodes = await generateBackupCodes(user.id);
    }

    // Success - remove session and issue token
    pending2FASessions.delete(setupToken);
    await recordLoginAttempt(ipAddress, user.email, true, userAgent);

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      action: 'login',
      entityType: 'auth',
      entityId: user.id,
      entityName: user.email,
      details: { twoFactor: true, method, firstSetup: true },
      ipAddress,
      userAgent,
    });

    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      backupCodes,
      message: '2FA successfully enabled',
      mustChangePassword: user.mustChangePassword || false,
    });
  } catch (error) {
    return c.json({ error: 'Verification failed' }, 400);
  }
});

auth.post('/logout', authMiddleware, async (c) => {
  await audit.logout(c);
  return c.json({ message: 'Logged out successfully' });
});

auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user') as { id: number };
  const dbUser = await db.select({
    id: schema.users.id,
    email: schema.users.email,
    name: schema.users.name,
    firstName: schema.users.firstName,
    lastName: schema.users.lastName,
    phone: schema.users.phone,
    role: schema.users.role,
    mustChangePassword: schema.users.mustChangePassword,
  }).from(schema.users).where(eq(schema.users.id, user.id)).get();

  return c.json({ user: dbUser });
});

// Update own profile (firstName, lastName, phone)
const profileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional().default(''),
});

auth.put('/profile', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: number };
    const body = await c.req.json();
    const { firstName, lastName, phone } = profileSchema.parse(body);
    const name = `${firstName} ${lastName}`.trim();

    await db.update(schema.users)
      .set({ firstName, lastName, name, phone, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.users.id, user.id));

    return c.json({ message: 'Profile updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Change password (required when mustChangePassword is true)
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

auth.post('/change-password', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: number };
    const body = await c.req.json();
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    const dbUser = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
    if (!dbUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, dbUser.passwordHash);
    if (!validPassword) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    // Validate new password against policy
    const validation = await validatePassword(newPassword);
    if (!validation.valid) {
      return c.json({ error: 'New password does not meet requirements', details: validation.errors }, 400);
    }

    // Check that new password is different from current
    const samePassword = await bcrypt.compare(newPassword, dbUser.passwordHash);
    if (samePassword) {
      return c.json({ error: 'New password must be different from current' }, 400);
    }

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(schema.users)
      .set({
        passwordHash,
        mustChangePassword: false,
        updatedAt: getCurrentTimestamp()
      })
      .where(eq(schema.users.id, user.id));

    return c.json({ message: 'Password successfully changed' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Forgot password - request reset email
const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

// Rate limit: 3 requests per 15 minutes per IP
auth.post('/forgot-password', rateLimit('forgot-password', 3, 15 * 60 * 1000), async (c) => {
  try {
    const body = await c.req.json();
    const { email } = forgotPasswordSchema.parse(body);

    const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();

    // Always return success to prevent email enumeration
    if (!user) {
      return c.json({ message: 'If the email exists, a reset link has been sent' });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Save token
    await db.insert(schema.passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
    });

    // Get base URL from system settings
    const systemSetting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'system')).get();
    const systemSettings = (systemSetting?.value as { systemName?: string; baseUrl?: string }) || {};
    const baseUrl = systemSettings.baseUrl || process.env.FRONTEND_URL || 'http://localhost:3000';
    const systemName = systemSettings.systemName || 'Hosting Panel';

    // Send email
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    await sendEmail({
      to: user.email,
      subject: `${systemName} - Password Reset`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Password Reset</h2>
          <p>We received a password reset request for your account.</p>
          <p>Click the link below to set a new password:</p>
          <p style="margin: 20px 0;">
            <a href="${resetUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            This link is valid for 1 hour. If you did not request a password reset, please ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px;">${systemName}</p>
        </div>
      `,
      text: `Password Reset\n\nClick the link to reset your password: ${resetUrl}\n\nThis link is valid for 1 hour.\n\n${systemName}`,
    });

    // Audit log (public route, no auth context)
    try {
      const ipAddr = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
      await db.insert(schema.auditLogs).values({
        userId: null,
        userName: email,
        userEmail: email,
        action: 'password_reset_request',
        entityType: 'auth',
        entityName: email,
        ipAddress: ipAddr,
        userAgent: c.req.header('user-agent') || 'unknown',
      });
    } catch { /* audit should not fail the request */ }

    return c.json({ message: 'If the email exists, a reset link has been sent' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    console.error('Forgot password error:', error);
    return c.json({ message: 'If the email exists, a reset link has been sent' });
  }
});

// Reset password with token
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

// Rate limit: 5 attempts per 15 minutes per IP
auth.post('/reset-password', rateLimit('reset-password', 5, 15 * 60 * 1000), async (c) => {
  try {
    const body = await c.req.json();
    const { token, password } = resetPasswordSchema.parse(body);

    // Find valid token
    const resetToken = await db.select()
      .from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.token, token),
          gt(schema.passwordResetTokens.expiresAt, getCurrentTimestamp())
        )
      )
      .get();

    if (!resetToken || resetToken.usedAt) {
      return c.json({ error: 'Invalid or expired token' }, 400);
    }

    // Validate password against policy
    const validation = await validatePassword(password);
    if (!validation.valid) {
      return c.json({ error: 'Password does not meet requirements', details: validation.errors }, 400);
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update user password
    await db.update(schema.users)
      .set({ passwordHash, updatedAt: getCurrentTimestamp() })
      .where(eq(schema.users.id, resetToken.userId));

    // Mark token as used
    await db.update(schema.passwordResetTokens)
      .set({ usedAt: getCurrentTimestamp() })
      .where(eq(schema.passwordResetTokens.id, resetToken.id));

    // Audit log (public route, no auth context)
    try {
      const ipAddr = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
      await db.insert(schema.auditLogs).values({
        userId: resetToken.userId,
        userName: 'password_reset',
        userEmail: '',
        action: 'password_reset',
        entityType: 'auth',
        entityId: resetToken.userId,
        ipAddress: ipAddr,
        userAgent: c.req.header('user-agent') || 'unknown',
      });
    } catch { /* audit should not fail the request */ }

    return c.json({ message: 'Password reset successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// --- Setup wizard endpoints (public, no auth) ---

auth.get('/setup-status', async (c) => {
  const result = await db.select({ value: count() }).from(schema.users).get();
  const userCount = result?.value ?? 0;
  return c.json({ needsSetup: userCount === 0 });
});

const setupSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(''),
  password: z.string().min(6),
});

auth.post('/setup', async (c) => {
  try {
    // Only allow when zero users exist
    const result = await db.select({ value: count() }).from(schema.users).get();
    const userCount = result?.value ?? 0;
    if (userCount > 0) {
      return c.json({ error: 'Setup already completed' }, 403);
    }

    const body = await c.req.json();
    const { firstName, lastName, email, phone, password } = setupSchema.parse(body);

    // Validate password against policy
    const validation = await validatePassword(password);
    if (!validation.valid) {
      return c.json({ error: 'Password does not meet requirements', details: validation.errors }, 400);
    }

    const name = `${firstName} ${lastName}`.trim();
    const passwordHash = await bcrypt.hash(password, 10);

    await db.insert(schema.users).values({
      email,
      passwordHash,
      name,
      firstName,
      lastName,
      phone,
      role: 'superadmin',
      mustChangePassword: false,
    });

    // Seed default settings, templates, notification settings
    await seedDefaults();

    const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();

    if (!user) {
      return c.json({ error: 'Failed to create user' }, 500);
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

export default auth;
