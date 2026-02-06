import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import auth from './routes/auth.js';
import users from './routes/users.js';
import clients from './routes/clients.js';
import domains from './routes/domains.js';
import hosting from './routes/hosting.js';
import packages from './routes/mail-packages.js';
import mailServers from './routes/mail-servers.js';
import mailSecurity from './routes/mail-security.js';
import notifications from './routes/notifications.js';
import dashboard from './routes/dashboard.js';
import backup from './routes/backup.js';
import templates from './routes/templates.js';
import settings from './routes/settings.js';
import company from './routes/company.js';
import audit from './routes/audit.js';
import system from './routes/system.js';
import security from './routes/security.js';

import { startScheduler } from './services/scheduler.js';
import { notifyApplicationStart, notifyApplicationError } from './services/systemNotifications.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: (origin) => {
    if (process.env.CORS_ORIGINS) {
      const allowed = process.env.CORS_ORIGINS.split(',').map(o => o.trim());
      return allowed.includes(origin) ? origin : null;
    }
    // When no CORS_ORIGINS is set, reject cross-origin requests (same-origin only)
    return null;
  },
  credentials: true,
}));

// Health check
app.get('/', (c) => c.json({ status: 'ok', message: 'Hosting Panel API' }));
app.get('/health', (c) => c.json({ status: 'healthy' }));

// Public branding endpoint (no auth required)
import { db, schema } from './db/index.js';
import { eq } from 'drizzle-orm';

app.get('/api/public/branding', async (c) => {
  const [systemSetting, companyInfo] = await Promise.all([
    db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'system')).get(),
    db.select().from(schema.companyInfo).get(),
  ]);

  const systemName = (systemSetting?.value as { systemName?: string })?.systemName || 'Hosting Panel';
  const logo = companyInfo?.logo || null;

  return c.json({ systemName, logo });
});

// Routes
app.route('/api/auth', auth);
app.route('/api/users', users);
app.route('/api/clients', clients);
app.route('/api/domains', domains);
app.route('/api/hosting', hosting);
app.route('/api/packages', packages);
app.route('/api/mail-servers', mailServers);
app.route('/api/mail-security', mailSecurity);
app.route('/api/notifications', notifications);
app.route('/api/dashboard', dashboard);
app.route('/api/backup', backup);
app.route('/api/templates', templates);
app.route('/api/settings', settings);
app.route('/api/company', company);
app.route('/api/audit', audit);
app.route('/api/system', system);
app.route('/api/security', security);

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  // Send notification for application errors (async, don't await)
  notifyApplicationError(err.message).catch(() => {});
  return c.json({ error: 'Internal server error' }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

const port = parseInt(process.env.PORT || '8080');

console.log(`Starting server on port ${port}...`);

// Start scheduler for notifications
startScheduler();

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running on http://localhost:${port}`);

// Send application start notification (delayed to allow DB to be ready)
setTimeout(() => {
  notifyApplicationStart().catch(console.error);
}, 5000);
