import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { zipSync, strToU8 } from 'fflate';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

const BACKUP_DIR = '/app/data/backups';
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

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

/** Get next sequence number for backups with same timestamp prefix */
function getNextSequence(prefix: string): string {
  ensureBackupDir();
  const entries = fs.readdirSync(BACKUP_DIR);
  let maxSeq = 0;
  for (const entry of entries) {
    if (entry.startsWith(prefix)) {
      const match = entry.match(/(\d{3})\.zip$/);
      if (match) {
        const seq = parseInt(match[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    }
  }
  return String(maxSeq + 1).padStart(3, '0');
}

/** Generate backup filename: "{systemName} Backup-yyyymmddhhmmSSS.zip" */
export function generateBackupFilename(systemName: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
  const prefix = `${systemName} Backup-${timestamp}`;
  const seq = getNextSequence(prefix);
  return `${prefix}${seq}.zip`;
}

/** Encrypt data with AES-256-GCM using password */
function encryptData(data: Buffer, password: string): { ciphertext: Buffer; salt: Buffer; iv: Buffer } {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([encrypted, authTag]), salt, iv };
}

/** Create a ZIP backup with optional password encryption */
function createZipBuffer(jsonString: string, password?: string): Buffer {
  if (password) {
    const jsonBytes = Buffer.from(jsonString, 'utf-8');
    const { ciphertext, salt, iv } = encryptData(jsonBytes, password);
    const meta = JSON.stringify({
      encrypted: true,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
    });
    const zipData = zipSync({
      'backup.enc': new Uint8Array(ciphertext),
      'meta.json': strToU8(meta),
    });
    return Buffer.from(zipData);
  }
  const zipData = zipSync({
    'backup.json': strToU8(jsonString),
  });
  return Buffer.from(zipData);
}

/** Create a server-side backup, returns file info */
export async function createServerBackup(password?: string): Promise<{ filename: string; size: number; createdAt: string }> {
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
  const zipBuffer = createZipBuffer(jsonString, password);
  const filePath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(filePath, zipBuffer);

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
    if (!file.endsWith('.zip') && !file.endsWith('.json')) continue;
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
    if (!entry.endsWith('.zip') && !entry.endsWith('.json')) continue;
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
