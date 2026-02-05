import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { getDashboardStats, getExpiringItems, getWillBeDeletedItems, getRecentActivity } from '../services/reports.js';

const dashboard = new Hono();

dashboard.use('*', authMiddleware);

dashboard.get('/stats', async (c) => {
  const stats = await getDashboardStats();
  return c.json({ stats });
});

dashboard.get('/expiring', async (c) => {
  const days = parseInt(c.req.query('days') || '30');
  const items = await getExpiringItems(days);
  return c.json({ items });
});

dashboard.get('/will-be-deleted', async (c) => {
  const items = await getWillBeDeletedItems();
  return c.json({ items });
});

dashboard.get('/activity', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10');
  const activity = await getRecentActivity(limit);
  return c.json({ activity });
});

export default dashboard;
