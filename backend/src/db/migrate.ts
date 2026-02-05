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
  const migrationSql = readFileSync(join(migrationsDir, file), 'utf-8');

  // First try executing the whole file at once
  try {
    sqlite.exec(migrationSql);
    continue;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If whole-file fails on "duplicate column", retry statement-by-statement
    // so other new columns in the same file can still be added
    if (errorMessage.includes('duplicate column name')) {
      const statements = migrationSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const stmt of statements) {
        try {
          sqlite.exec(stmt + ';');
        } catch (stmtError: unknown) {
          const stmtMsg = stmtError instanceof Error ? stmtError.message : String(stmtError);
          if (stmtMsg.includes('duplicate column name') ||
              stmtMsg.includes('already exists')) {
            // Safe to skip
          } else {
            console.error(`    Error in ${file}: ${stmtMsg}`);
            throw stmtError;
          }
        }
      }
    } else if (errorMessage.includes('no such column: days_before')) {
      console.log(`    Skipping (already migrated)`);
    } else if (errorMessage.includes('table') && errorMessage.includes('already exists')) {
      console.log(`    Skipping (table already exists)`);
    } else {
      console.error(`    Error in ${file}: ${errorMessage}`);
      throw error;
    }
  }
}

console.log('Migrations completed!');

sqlite.close();
