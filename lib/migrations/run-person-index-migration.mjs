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
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('Running person index columns migration...');
    await client.connect();

    const migrationSql = readFileSync(
      join(__dirname, 'add_person_index_to_wordpress_posts.sql'),
      'utf8'
    );
    await client.query(migrationSql);

    console.log('✅ Person index columns added to wordpress_posts.');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
