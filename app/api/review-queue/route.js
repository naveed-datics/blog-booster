import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/cronAuth';
import {
  listPendingReview,
  approveReviewItem,
  rejectReviewItem,
} from '@/lib/reviewQueue';
import { getQuotaRemaining } from '@/lib/publishQuota';

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
