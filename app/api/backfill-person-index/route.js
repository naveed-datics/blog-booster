import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/cronAuth';
import { backfillPersonIndex } from '@/lib/personIndex';

/**
 * POST /api/backfill-person-index
 * Body: { website_id: number, include_sitemap?: boolean }
 *
 * Populates person page index from app data only:
 * wordpress_posts, trends, article_drafts, and public sitemap XML.
 * Does not call WordPress REST API.
 */
export async function POST(request) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const websiteId = body.website_id ?? body.websiteId;
    const includeSitemap = body.include_sitemap !== false;

    if (!websiteId) {
      return NextResponse.json(
        { error: 'website_id is required' },
        { status: 400 }
      );
    }

    const stats = await backfillPersonIndex(websiteId, { includeSitemap });

    return NextResponse.json({
      success: true,
      message: 'Person index backfill completed (app-side sources only)',
      stats,
    });
  } catch (error) {
    console.error('backfill-person-index error:', error);
    return NextResponse.json(
      { error: 'Backfill failed', message: error.message },
      { status: 500 }
    );
  }
}
