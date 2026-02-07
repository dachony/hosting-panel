import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { getDashboardStats, getExpiringItems, getExpiredItems, getForDeletionItems, getWillBeDeletedItems, getRecentActivity, getMissingOffers } from '../services/reports.js';
import { safeParseInt } from '../utils/validation.js';

const dashboard = new Hono();

dashboard.use('*', authMiddleware);

dashboard.get('/stats', async (c) => {
  const stats = await getDashboardStats();
  return c.json({ stats });
});

dashboard.get('/expiring', async (c) => {
  const days = Math.max(1, safeParseInt(c.req.query('days'), 30) ?? 30);
  const items = await getExpiringItems(days);
  return c.json({ items });
});

dashboard.get('/expired', async (c) => {
  const items = await getExpiredItems();
  return c.json({ items });
});

dashboard.get('/for-deletion', async (c) => {
  const items = await getForDeletionItems();
  return c.json({ items });
});

dashboard.get('/will-be-deleted', async (c) => {
  const items = await getWillBeDeletedItems();
  return c.json({ items });
});

dashboard.get('/missing-offers', async (c) => {
  const items = await getMissingOffers();
  return c.json({ items });
});

dashboard.get('/activity', async (c) => {
  const limit = Math.max(1, Math.min(safeParseInt(c.req.query('limit'), 10) ?? 10, 100));
  const activity = await getRecentActivity(limit);
  return c.json({ activity });
});

export default dashboard;
