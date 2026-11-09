import { NextResponse } from 'next/server';
import { isAuthorized, isCronBearerAuthorized } from '@/lib/cronAuth';
import { evaluateGscRecoverySignal } from '@/lib/gscRecoverySignal';

export async function GET(request) {
  if (!(await isCronBearerAuthorized(request)) && !(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get('website_id') || '1';
  const userId = searchParams.get('user_id');

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id required (GSC OAuth owner)' },
      { status: 400 }
    );
  }

  try {
    const result = await evaluateGscRecoverySignal(websiteId, parseInt(userId, 10));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('gsc-recovery-check error:', error);
    return NextResponse.json(
      { error: 'GSC recovery check failed', message: error.message },
      { status: 500 }
    );
  }
}
