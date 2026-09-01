import { Client } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config({ path: '.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedPath = join(__dirname, 'seed-content-quality-good.json');

async function main() {
  const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
  const postIds = (seed.post_ids || []).map(Number).filter(Boolean);
  const slugs = (seed.slugs || []).map((s) => s.toLowerCase().trim()).filter(Boolean);

  if (postIds.length === 0 && slugs.length === 0) {
    console.log('No post_ids or slugs in seed file — add the ~76 rebuilt pages first.');
    process.exit(0);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  let updated = 0;

  if (postIds.length > 0) {
    const r = await client.query(
      `UPDATE wordpress_posts SET content_quality = 'good', updated_at = NOW()
       WHERE post_id = ANY($1::int[])`,
      [postIds]
    );
    updated += r.rowCount;
  }

  if (slugs.length > 0) {
    const r = await client.query(
      `UPDATE wordpress_posts SET content_quality = 'good', updated_at = NOW()
       WHERE lower(slug) = ANY($1::text[])`,
      [slugs]
    );
    updated += r.rowCount;
  }

  console.log(`✅ Seeded content_quality=good for ${updated} row(s).`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
