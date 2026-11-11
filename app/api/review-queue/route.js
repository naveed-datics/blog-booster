import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/cronAuth';
import {
  listPendingReview,
  approveReviewItem,
  rejectReviewItem,
} from '@/lib/reviewQueue';
import { getQuotaRemaining } from '@/lib/publishQuota';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get('website_id');
  if (!websiteId) {
    return NextResponse.json({ error: 'website_id required' }, { status: 400 });
  }

  const [items, quota] = await Promise.all([
    listPendingReview(websiteId),
    getQuotaRemaining(websiteId),
  ]);

  return NextResponse.json({ items, quota });
}

export async function POST(request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { action, id, resolved_by: resolvedBy } = body;

  if (!id || !action) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 });
  }

  if (action === 'approve') {
    const row = await approveReviewItem(id, resolvedBy || 'dashboard');
    return NextResponse.json({ success: Boolean(row), item: row });
  }

  if (action === 'reject') {
    const row = await rejectReviewItem(id, resolvedBy || 'dashboard');
    return NextResponse.json({ success: Boolean(row), item: row });
  }

  return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
}

// DELETE - Clear this website's pending review queue.
//
// Scoped to status='pending' because that is exactly what the Review tab
// lists; already-resolved rows stay as the record of what was approved or
// rejected. Session-only so a shared pipeline API key cannot clear the
// queue it writes to.
export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const websiteId = parseInt(searchParams.get('website_id'), 10);

    if (!Number.isInteger(websiteId) || websiteId <= 0) {
      return NextResponse.json(
        { error: 'A numeric website_id is required' },
        { status: 400 }
      );
    }

    const result = await query(
      `DELETE FROM review_queue WHERE website_id = $1 AND status = 'pending' RETURNING id`,
      [websiteId]
    );

    return NextResponse.json({
      message: `Deleted ${result.rowCount} pending review item(s)`,
      deleted: result.rowCount,
    });
  } catch (error) {
    console.error('Error deleting review queue:', error);
    return NextResponse.json(
      { error: 'Failed to delete review items', details: error.message },
      { status: 500 }
    );
  }
}
