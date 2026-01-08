import pool, { query } from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('Running database migration...');
    
    const sqlFile = path.join(__dirname, 'create_trends_table.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute the SQL file
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('✅ Trends table created with indexes and triggers.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

