import { Client } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Running authentication database migrations...');
    await client.connect();
    console.log('Connected to database...');

    // Run users table migration
    console.log('Creating users table...');
    const usersSql = readFileSync(join(__dirname, 'create_users_table.sql'), 'utf8');
    await client.query(usersSql);
    console.log('✅ Users table created');

    // Run sessions table migration
    console.log('Creating sessions table...');
    const sessionsSql = readFileSync(join(__dirname, 'create_sessions_table.sql'), 'utf8');
    await client.query(sessionsSql);
    console.log('✅ Sessions table created');

    // Run accounts table migration
    console.log('Creating accounts table...');
    const accountsSql = readFileSync(join(__dirname, 'create_accounts_table.sql'), 'utf8');
    await client.query(accountsSql);
    console.log('✅ Accounts table created');

    // Run websites table migration
    console.log('Creating websites table...');
    const websitesSql = readFileSync(join(__dirname, 'create_websites_table.sql'), 'utf8');
    await client.query(websitesSql);
    console.log('✅ Websites table created');

    console.log('✅ All authentication migrations completed successfully!');
  } catch (error) {
    console.error('❌ Error running migrations:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();

