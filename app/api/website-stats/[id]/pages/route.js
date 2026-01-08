import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET(request, { params }) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = parseInt(session.user.id);
    const websiteId = parseInt(params.id);

    // Verify the website belongs to the user
    const websiteCheck = await query(
      'SELECT id, website_url FROM websites WHERE id = $1 AND user_id = $2',
      [websiteId, userId]
    );

    if (websiteCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Website not found or access denied' },
        { status: 404 }
      );
    }

    const website = websiteCheck.rows[0];

    // Placeholder: Return empty array for now
    // You can implement actual page fetching logic here based on your website's API
    // For example, if you have a WordPress site, you could fetch pages via REST API
    const pages = [];

    // Example structure (uncomment and modify based on your needs):
    // if (website.api_key) {
    //   // Fetch pages from website API
    //   // const response = await fetch(`${website.website_url}/wp-json/wp/v2/pages`, {
    //   //   headers: { 'Authorization': `Bearer ${website.api_key}` }
    //   // });
    //   // const data = await response.json();
    //   // pages = data.map(page => ({ title: page.title.rendered, url: page.link }));
    // }

    return NextResponse.json({
      pages
    });
  } catch (error) {
    console.error('Error fetching website pages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch website pages', details: error.message },
      { status: 500 }
    );
  }
}

