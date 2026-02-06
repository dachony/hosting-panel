import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, superAdminMiddleware, AppEnv } from '../middleware/auth.js';
import { z } from 'zod';
import { getCurrentTimestamp } from '../utils/dates.js';
import { notifySuperadminPasswordChange, notifyAdminPasswordChange } from '../services/systemNotifications.js';
import { validatePassword, generateTemporaryPassword } from '../services/security.js';
import { sendEmail } from '../services/email.js';
import { parseId } from '../utils/validation.js';

const users = new Hono<AppEnv>();

// Only superadmin can manage users
users.use('*', authMiddleware, superAdminMiddleware);

const roleEnum = z.enum(['superadmin', 'admin', 'salesadmin', 'sales']);

const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional().nullable(),
  role: roleEnum.default('sales'),
  sendInvite: z.boolean().default(false),
  password: z.string().optional(), // Optional if sendInvite is true
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  role: roleEnum.optional(),
  password: z.string().optional(),
  isActive: z.boolean().optional(),
});

// Get system settings (for baseUrl)
async function getSystemSettings() {
  const setting = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'system')).get();
  return setting?.value as { systemName?: string; baseUrl?: string } || {};
}

// Get all users
users.get('/', async (c) => {
  const allUsers = await db.select({
    id: schema.users.id,
    email: schema.users.email,
    name: schema.users.name,
    firstName: schema.users.firstName,
    lastName: schema.users.lastName,
    phone: schema.users.phone,
    role: schema.users.role,
    isActive: schema.users.isActive,
    twoFactorEnabled: schema.users.twoFactorEnabled,
    mustChangePassword: schema.users.mustChangePassword,
    createdAt: schema.users.createdAt,
  }).from(schema.users);

  return c.json({ users: allUsers });
});

// Create user
users.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const data = createUserSchema.parse(body);

    const existing = await db.select().from(schema.users).where(eq(schema.users.email, data.email)).get();
    if (existing) {
      return c.json({ error: 'Email already exists' }, 400);
    }

    let password: string;
    let mustChangePassword = false;

    if (data.sendInvite) {
      // Generate temporary password
      password = await generateTemporaryPassword();
      mustChangePassword = true;
    } else {
      if (!data.password) {
        return c.json({ error: 'Password is required when not sending invite' }, 400);
      }
      password = data.password;

      // Validate password against policy
      const validation = await validatePassword(password);
      if (!validation.valid) {
        return c.json({ error: 'Password does not meet requirements', details: validation.errors }, 400);
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const fullName = `${data.firstName} ${data.lastName}`;

    const [user] = await db.insert(schema.users).values({
      email: data.email,
      passwordHash,
      name: fullName,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
      role: data.role,
      isActive: true,
      mustChangePassword,
    }).returning();

    // Send invite email if requested
    if (data.sendInvite) {
      const systemSettings = await getSystemSettings();
      const baseUrl = systemSettings.baseUrl || 'http://localhost:3000';
      const systemName = systemSettings.systemName || 'Hosting Panel';

      try {
        await sendEmail({
          to: data.email,
          subject: `Pozivnica za pristup - ${systemName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">Welcome to ${systemName}</h2>
              </div>
              <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p>Dear ${fullName},</p>
                <p>Your user account has been created for system access to ${systemName}.</p>

                <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0;"><strong>Login details:</strong></p>
                  <table style="width: 100%;">
                    <tr>
                      <td style="padding: 5px 0; color: #6b7280;">Email:</td>
                      <td style="padding: 5px 0;"><strong>${data.email}</strong></td>
                    </tr>
                    <tr>
                      <td style="padding: 5px 0; color: #6b7280;">Temporary password:</td>
                      <td style="padding: 5px 0; font-family: monospace; background: #fef3c7; padding: 5px 10px; border-radius: 4px;"><strong>${password}</strong></td>
                    </tr>
                  </table>
                </div>

                <p style="color: #dc2626;"><strong>Important:</strong> You must change your password after the first login.</p>

                <div style="text-align: center; margin: 25px 0;">
                  <a href="${baseUrl}" style="background: #1e40af; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                    Login
                  </a>
                </div>

                <p style="color: #6b7280; font-size: 12px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                  This message was automatically generated. Please do not reply.
                </p>
              </div>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Failed to send invite email:', emailError);
        // Don't fail the user creation, just log the error
      }
    }

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
      },
      inviteSent: data.sendInvite,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Update user
users.put('/:id', async (c) => {
  try {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid user ID' }, 400);
    const body = await c.req.json();
    const data = updateUserSchema.parse(body);
    const currentUser = c.get('user');

    const existing = await db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    if (!existing) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Prevent changing own role from superadmin
    if (currentUser.id === id && data.role && data.role !== 'superadmin' && existing.role === 'superadmin') {
      return c.json({ error: 'Cannot demote yourself from Super Administrator' }, 400);
    }

    // Prevent disabling yourself
    if (currentUser.id === id && data.isActive === false) {
      return c.json({ error: 'Cannot disable your own account' }, 400);
    }

    const updateData: Record<string, unknown> = {
      updatedAt: getCurrentTimestamp(),
    };

    if (data.email) updateData.email = data.email;
    if (data.firstName !== undefined || data.lastName !== undefined) {
      const firstName = data.firstName ?? existing.firstName ?? '';
      const lastName = data.lastName ?? existing.lastName ?? '';
      updateData.firstName = firstName;
      updateData.lastName = lastName;
      updateData.name = `${firstName} ${lastName}`.trim();
    }
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.role) updateData.role = data.role;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    if (data.password) {
      // Validate password against policy
      const validation = await validatePassword(data.password);
      if (!validation.valid) {
        return c.json({ error: 'Password does not meet requirements', details: validation.errors }, 400);
      }
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
      updateData.mustChangePassword = false; // Reset flag when password is changed
    }

    const [user] = await db.update(schema.users)
      .set(updateData)
      .where(eq(schema.users.id, id))
      .returning();

    // Send notification if password was changed
    if (data.password) {
      const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');
      if (existing.role === 'superadmin') {
        notifySuperadminPasswordChange(user.name, user.email, ipAddress).catch(() => {});
      } else if (existing.role === 'admin') {
        notifyAdminPasswordChange(user.name, user.email, ipAddress).catch(() => {});
      }
    }

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400);
    }
    throw error;
  }
});

// Toggle user active status
users.patch('/:id/toggle-active', async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid user ID' }, 400);
  const currentUser = c.get('user');

  if (currentUser.id === id) {
    return c.json({ error: 'Cannot toggle your own account status' }, 400);
  }

  const existing = await db.select().from(schema.users).where(eq(schema.users.id, id)).get();
  if (!existing) {
    return c.json({ error: 'User not found' }, 404);
  }

  const [user] = await db.update(schema.users)
    .set({
      isActive: !existing.isActive,
      updatedAt: getCurrentTimestamp(),
    })
    .where(eq(schema.users.id, id))
    .returning();

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
    },
  });
});

// Resend invite
users.post('/:id/resend-invite', async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid user ID' }, 400);

  const existing = await db.select().from(schema.users).where(eq(schema.users.id, id)).get();
  if (!existing) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Generate new temporary password
  const password = await generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(password, 10);

  await db.update(schema.users)
    .set({
      passwordHash,
      mustChangePassword: true,
      updatedAt: getCurrentTimestamp(),
    })
    .where(eq(schema.users.id, id));

  // Send invite email
  const systemSettings = await getSystemSettings();
  const baseUrl = systemSettings.baseUrl || 'http://localhost:3000';
  const systemName = systemSettings.systemName || 'Hosting Panel';

  try {
    await sendEmail({
      to: existing.email,
      subject: `Nova pozivnica za pristup - ${systemName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">Nova pozivnica - ${systemName}</h2>
          </div>
          <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p>Dear ${existing.name},</p>
            <p>A new temporary password has been generated for your account.</p>

            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Login details:</strong></p>
              <table style="width: 100%;">
                <tr>
                  <td style="padding: 5px 0; color: #6b7280;">Email:</td>
                  <td style="padding: 5px 0;"><strong>${existing.email}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 5px 0; color: #6b7280;">New temporary password:</td>
                  <td style="padding: 5px 0; font-family: monospace; background: #fef3c7; padding: 5px 10px; border-radius: 4px;"><strong>${password}</strong></td>
                </tr>
              </table>
            </div>

            <p style="color: #dc2626;"><strong>Important:</strong> You must change your password after login.</p>

            <div style="text-align: center; margin: 25px 0;">
              <a href="${baseUrl}" style="background: #1e40af; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Login
              </a>
            </div>
          </div>
        </div>
      `,
    });

    return c.json({ message: 'Invite sent successfully' });
  } catch (error) {
    return c.json({ error: 'Failed to send invite email' }, 500);
  }
});

// Delete user
users.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid user ID' }, 400);
  const currentUser = c.get('user');

  if (currentUser.id === id) {
    return c.json({ error: 'Cannot delete yourself' }, 400);
  }

  const existing = await db.select().from(schema.users).where(eq(schema.users.id, id)).get();
  if (!existing) {
    return c.json({ error: 'User not found' }, 404);
  }

  await db.delete(schema.users).where(eq(schema.users.id, id));

  return c.json({ message: 'User deleted' });
});

export default users;
