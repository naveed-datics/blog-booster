import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/cronAuth';
import { backfillWpInventory } from '@/lib/wpInventoryBackfill';
import { lookupPerson } from '@/lib/personLookup';

/**
 * POST /api/backfill-wp-inventory
 * Body: { website_id: number, dry_run?: boolean }
 */
export async function POST(request) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const websiteId = body.website_id ?? body.websiteId;
    const dryRun = body.dry_run === true;

    if (!websiteId) {
      return NextResponse.json({ error: 'website_id is required' }, { status: 400 });
    }

    const stats = await backfillWpInventory(websiteId, { dryRun });

    let acceptance = null;
    if (!dryRun) {
      const hegseth = await lookupPerson(websiteId, 'Pete Hegseth');
      acceptance = {
        pete_hegseth_lookup: hegseth,
        passes_hegseth_3229: hegseth.postId === 3229,
      };
    }

    return NextResponse.json({
      success: true,
      stats,
      acceptance,
    });
  } catch (error) {
    console.error('backfill-wp-inventory error:', error);
    return NextResponse.json(
      { error: 'Inventory backfill failed', message: error.message },
      { status: 500 }
    );
  }
}
