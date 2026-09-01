import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/cronAuth';
import { lookupPerson } from '@/lib/personLookup';

/**
 * GET /api/person-lookup?website_id=1&celebrity_name=Anne+Hathaway
 * App-side person page lookup (no WordPress REST).
 */
export async function GET(request) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const websiteId = searchParams.get('website_id');
    const celebrityName =
      searchParams.get('celebrity_name') ||
      searchParams.get('name') ||
      searchParams.get('q');

    if (!websiteId || !celebrityName?.trim()) {
      return NextResponse.json(
        { error: 'website_id and celebrity_name are required' },
        { status: 400 }
      );
    }

    const result = await lookupPerson(websiteId, celebrityName.trim());

    return NextResponse.json({
      success: true,
      celebrity_name: celebrityName.trim(),
      lookup: result,
    });
  } catch (error) {
    console.error('person-lookup error:', error);
    return NextResponse.json(
      { error: 'Lookup failed', message: error.message },
      { status: 500 }
    );
  }
}
