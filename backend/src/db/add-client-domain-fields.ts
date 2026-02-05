import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '../../data/hosting.db');

const db = new Database(dbPath);

console.log('Adding new fields to clients and domains tables...');

// Add new columns to clients table
const clientColumns = [
  { name: 'address', type: 'TEXT' },
  { name: 'pib', type: 'TEXT' },
  { name: 'mib', type: 'TEXT' },
];

for (const col of clientColumns) {
  try {
    db.exec(`ALTER TABLE clients ADD COLUMN ${col.name} ${col.type}`);
    console.log(`Added column ${col.name} to clients table`);
  } catch (e: unknown) {
    const error = e as Error;
    if (error.message.includes('duplicate column name')) {
      console.log(`Column ${col.name} already exists in clients table`);
    } else {
      throw error;
    }
  }
}

// Add new columns to domains table
const domainColumns = [
  { name: 'contact_email1', type: 'TEXT' },
  { name: 'contact_email2', type: 'TEXT' },
  { name: 'contact_email3', type: 'TEXT' },
];

for (const col of domainColumns) {
  try {
    db.exec(`ALTER TABLE domains ADD COLUMN ${col.name} ${col.type}`);
    console.log(`Added column ${col.name} to domains table`);
  } catch (e: unknown) {
    const error = e as Error;
    if (error.message.includes('duplicate column name')) {
      console.log(`Column ${col.name} already exists in domains table`);
    } else {
      throw error;
    }
  }
}

db.close();
console.log('Migration completed successfully!');
