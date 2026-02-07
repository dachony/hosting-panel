import fs from 'fs';
import path from 'path';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

const BACKUP_DIR = '/app/data/backups';

/** Ensure backup directory exists */
function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/** Get all export data (same logic as /export with types=all) */
export async function getExportData(): Promise<Record<string, unknown>> {
  const [
    clients,
    domains,
    webHosting,
    mailHosting,
    mailPackages,
    mailServers,
    mailSecurity,
    templates,
    notificationSettings,
    reportSettings,
    users,
    backupCodes,
    appSettings,
    companyInfo,
    bankAccounts,
  ] = await Promise.all([
    db.select().from(schema.clients),
    db.select().from(schema.domains),
    db.select().from(schema.webHosting),
    db.select().from(schema.mailHosting),
    db.select().from(schema.mailPackages),
    db.select().from(schema.mailServers),
    db.select().from(schema.mailSecurity),
    db.select().from(schema.emailTemplates),
    db.select().from(schema.notificationSettings),
    db.select().from(schema.reportSettings),
    db.select().from(schema.users),
    db.select().from(schema.backupCodes),
    db.select().from(schema.appSettings),
    db.select().from(schema.companyInfo),
    db.select().from(schema.bankAccounts),
  ]);

  return {
    clients,
    domains,
    webHosting,
    mailHosting,
    packages: mailPackages,
    mailServers,
    mailSecurity,
    templates,
    notificationSettings,
    reportSettings,
    users,
    backupCodes,
    appSettings,
    companyInfo,
    bankAccounts,
  };
}

/** Get system name from appSettings */
export async function getSystemName(): Promise<string> {
  const setting = await db.select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, 'system'))
    .get();

  if (setting?.value && typeof setting.value === 'object') {
    const val = setting.value as { systemName?: string };
    return val.systemName || 'Hosting Panel';
  }
  return 'Hosting Panel';
}

/** Generate backup filename: "{systemName} Backup-yyyy-mm-dd-hh:mm.json" */
export function generateBackupFilename(systemName: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `${systemName} Backup-${date}-${time}.json`;
}

/** Create a server-side backup, returns file info */
export async function createServerBackup(): Promise<{ filename: string; size: number; createdAt: string }> {
  ensureBackupDir();

  const data = await getExportData();
  const systemName = await getSystemName();
  const filename = generateBackupFilename(systemName);

  const exportData = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    types: ['all'],
    data,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const filePath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(filePath, jsonString, 'utf-8');

  const stats = fs.statSync(filePath);
  return {
    filename,
    size: stats.size,
    createdAt: stats.mtime.toISOString(),
  };
}

/** Clean up old backups by retention days */
export function cleanupOldBackups(retentionDays: number): number {
  ensureBackupDir();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  const files = fs.readdirSync(BACKUP_DIR);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(BACKUP_DIR, file);
    const stats = fs.statSync(filePath);
    if (stats.mtime.getTime() < cutoff) {
      fs.unlinkSync(filePath);
      deleted++;
    }
  }

  return deleted;
}

export interface BackupFileInfo {
  filename: string;
  size: number;
  createdAt: string;
}

/** List backup files sorted by date desc */
export function getBackupFiles(): { files: BackupFileInfo[]; count: number; totalSize: number } {
  ensureBackupDir();
  const entries = fs.readdirSync(BACKUP_DIR);
  const files: BackupFileInfo[] = [];
  let totalSize = 0;

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const filePath = path.join(BACKUP_DIR, entry);
    const stats = fs.statSync(filePath);
    files.push({
      filename: entry,
      size: stats.size,
      createdAt: stats.mtime.toISOString(),
    });
    totalSize += stats.size;
  }

  // Sort by date desc (newest first)
  files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { files, count: files.length, totalSize };
}

export { BACKUP_DIR };
