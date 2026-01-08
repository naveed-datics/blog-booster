import { Client } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Running prompt_template column migration...');
    await client.connect();
    console.log('Connected to database...');

    const migrationSql = readFileSync(join(__dirname, 'add_prompt_template_to_websites.sql'), 'utf8');
    await client.query(migrationSql);

    console.log('✅ Migration completed successfully!');
    console.log('✅ Prompt template column added to websites table.');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();

