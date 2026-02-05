import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';

const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './data/hosting.db';
const dbDir = dirname(dbPath);

if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

console.log('Running migrations...');

// Get all migration files sorted by name
const migrationsDir = './src/db/migrations';
const migrationFiles = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of migrationFiles) {
  console.log(`  Running ${file}...`);
  try {
    const migrationSql = readFileSync(join(migrationsDir, file), 'utf-8');
    sqlite.exec(migrationSql);
  } catch (error: unknown) {
    // Ignore common idempotent migration errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('duplicate column name')) {
      console.log(`    Skipping (column already exists)`);
    } else if (errorMessage.includes('no such column: days_before')) {
      console.log(`    Skipping (already migrated)`);
    } else if (errorMessage.includes('table') && errorMessage.includes('already exists')) {
      console.log(`    Skipping (table already exists)`);
    } else {
      throw error;
    }
  }
}

console.log('Migrations completed!');

sqlite.close();
