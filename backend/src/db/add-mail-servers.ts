import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './data/hosting.db';
const db = new Database(dbPath);

console.log('Creating mail_servers table...');

// Create mail_servers table
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hostname TEXT NOT NULL,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Created mail_servers table');
} catch (e: any) {
  if (e.message.includes('already exists')) {
    console.log('mail_servers table already exists');
  } else {
    console.error('Error creating mail_servers table:', e.message);
  }
}

// Add mail_server_id column to web_hosting
try {
  db.exec(`ALTER TABLE web_hosting ADD COLUMN mail_server_id INTEGER`);
  console.log('Added mail_server_id column to web_hosting');
} catch (e: any) {
  if (e.message.includes('duplicate column')) {
    console.log('Column mail_server_id already exists');
  } else {
    console.error('Error adding mail_server_id:', e.message);
  }
}

console.log('Done!');
db.close();
