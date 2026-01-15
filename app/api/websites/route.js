import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auth } from '@/lib/auth';

// GET - Fetch all websites for the logged-in user
export async function GET(request) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = parseInt(session.user.id);

    const result = await query(
      'SELECT id, website_url, api_key, website_name, description, niche, sitemap, prompt_template, auto_mode, fetching_times, is_active, created_at, updated_at FROM websites WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    return NextResponse.json({
      websites: result.rows
    });
  } catch (error) {
    console.error('Error fetching websites:', error);
    return NextResponse.json(
      { error: 'Failed to fetch websites', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Add a new website
export async function POST(request) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = parseInt(session.user.id);
    const { website_url, api_key, website_name, description, niche, sitemap, prompt_template, auto_mode, fetching_times } = await request.json();

    // Validation
    if (!website_url || !website_url.trim()) {
      return NextResponse.json(
        { error: 'Website URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(website_url);
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Check if website already exists for this user
    const existing = await query(
      'SELECT id FROM websites WHERE user_id = $1 AND website_url = $2',
      [userId, website_url.trim()]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'Website with this URL already exists' },
        { status: 409 }
      );
    }

    // Insert new website
    const result = await query(
      'INSERT INTO websites (user_id, website_url, api_key, website_name, description, niche, sitemap, prompt_template, auto_mode, fetching_times) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, website_url, website_name, description, niche, sitemap, prompt_template, auto_mode, fetching_times, is_active, created_at',
      [userId, website_url.trim(), api_key?.trim() || null, website_name?.trim() || null, description?.trim() || null, niche?.trim() || null, sitemap?.trim() || null, prompt_template?.trim() || null, auto_mode === true, fetching_times?.trim() || null]
    );

    return NextResponse.json(
      {
        message: 'Website added successfully',
        website: result.rows[0]
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error adding website:', error);
    return NextResponse.json(
      { error: 'Failed to add website', details: error.message },
      { status: 500 }
    );
  }
}

