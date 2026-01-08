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
      'SELECT id, website_url, api_key FROM websites WHERE id = $1 AND user_id = $2',
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
    // You can implement actual post fetching logic here based on your website's API
    // For example, if you have a WordPress site, you could fetch posts via REST API
    const posts = [];

    // Example structure (uncomment and modify based on your needs):
    // if (website.api_key) {
    //   // Fetch posts from website API
    //   // const response = await fetch(`${website.website_url}/wp-json/wp/v2/posts`, {
    //   //   headers: { 'Authorization': `Bearer ${website.api_key}` }
    //   // });
    //   // const data = await response.json();
    //   // posts = data.map(post => ({ title: post.title.rendered, url: post.link }));
    // }

    return NextResponse.json({
      posts
    });
  } catch (error) {
    console.error('Error fetching website posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch website posts', details: error.message },
      { status: 500 }
    );
  }
}

