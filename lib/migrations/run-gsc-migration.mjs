import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('Running GSC migration...');

    const sqlFile = path.join(__dirname, 'create_gsc_tokens_table.sql');
    const oauthConfigFile = path.join(__dirname, 'create_gsc_oauth_config_table.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    const oauthConfigSql = fs.readFileSync(oauthConfigFile, 'utf8');

    await pool.query(sql);
    await pool.query(oauthConfigSql);

    console.log('✅ GSC migration completed successfully!');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ GSC migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
