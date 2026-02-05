import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './data/hosting.db';
const db = new Database(dbPath);

console.log('Adding new columns to clients table...');

const columns = [
  { name: 'domain', type: 'text' },
  { name: 'contact_person', type: 'text' },
  { name: 'email1', type: 'text' },
  { name: 'email2', type: 'text' },
  { name: 'email3', type: 'text' },
];

for (const col of columns) {
  try {
    db.exec(`ALTER TABLE clients ADD COLUMN ${col.name} ${col.type}`);
    console.log(`Added column: ${col.name}`);
  } catch (e: any) {
    if (e.message.includes('duplicate column')) {
      console.log(`Column ${col.name} already exists`);
    } else {
      console.error(`Error adding ${col.name}:`, e.message);
    }
  }
}

// Migrate old email to email1
try {
  db.exec(`UPDATE clients SET email1 = email WHERE email IS NOT NULL AND email1 IS NULL`);
  console.log('Migrated email to email1');
} catch (e) {
  console.log('No email migration needed');
}

console.log('Done!');
db.close();
