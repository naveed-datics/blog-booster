import dotenv from 'dotenv';
import { backfillWpInventory } from '../lib/wpInventoryBackfill.js';
import { lookupPerson } from '../lib/personLookup.js';

dotenv.config({ path: '.env.local' });

const websiteId = parseInt(process.argv[2] || '1', 10);
const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(`WP inventory backfill (website_id=${websiteId}, dry_run=${dryRun})...`);
  const stats = await backfillWpInventory(websiteId, { dryRun });
  console.log(JSON.stringify(stats, null, 2));

  if (!dryRun) {
    const hegseth = await lookupPerson(websiteId, 'Pete Hegseth');
    console.log('Pete Hegseth lookup:', JSON.stringify(hegseth, null, 2));
    console.log('Acceptance (postId === 3229):', hegseth.postId === 3229);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
