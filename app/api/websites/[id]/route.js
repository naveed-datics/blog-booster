import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auth } from '@/lib/auth';

// PUT - Update a website
export async function PUT(request, { params }) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = parseInt(session.user.id);
    const resolvedParams = await params;
    const websiteId = parseInt(resolvedParams.id);

    // Validate IDs
    if (!session.user.id || isNaN(userId) || userId <= 0) {
      return NextResponse.json(
        { error: 'Invalid user ID' },
        { status: 400 }
      );
    }

    if (!resolvedParams.id || isNaN(websiteId) || websiteId <= 0) {
      return NextResponse.json(
        { error: 'Invalid website ID' },
        { status: 400 }
      );
    }

    const { website_url, api_key, website_name, description, niche, sitemap, prompt_template, is_active, auto_mode, fetching_times } = await request.json();

    // Verify the website belongs to the user
    const existing = await query(
      'SELECT id FROM websites WHERE id = $1 AND user_id = $2',
      [websiteId, userId]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json(
        { error: 'Website not found or access denied' },
        { status: 404 }
      );
    }

    // Validate URL if provided
    if (website_url) {
      try {
        new URL(website_url);
      } catch (e) {
        return NextResponse.json(
          { error: 'Invalid URL format' },
          { status: 400 }
        );
      }
    }

    // Prepare update values - handle each field properly
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (website_url !== undefined && website_url !== null && website_url !== '') {
      updateFields.push(`website_url = $${paramIndex}`);
      updateValues.push(website_url.trim());
      paramIndex++;
    }
    if (api_key !== undefined && api_key !== null && api_key !== '') {
      updateFields.push(`api_key = $${paramIndex}`);
      updateValues.push(api_key.trim());
      paramIndex++;
    }
    if (website_name !== undefined && website_name !== null && website_name !== '') {
      updateFields.push(`website_name = $${paramIndex}`);
      updateValues.push(website_name.trim());
      paramIndex++;
    }
    if (description !== undefined && description !== null && description !== '') {
      updateFields.push(`description = $${paramIndex}`);
      updateValues.push(description.trim());
      paramIndex++;
    }
    if (niche !== undefined && niche !== null && niche !== '') {
      updateFields.push(`niche = $${paramIndex}`);
      updateValues.push(niche.trim());
      paramIndex++;
    }
    if (sitemap !== undefined && sitemap !== null && sitemap !== '') {
      updateFields.push(`sitemap = $${paramIndex}`);
      updateValues.push(sitemap.trim());
      paramIndex++;
    }
    if (prompt_template !== undefined && prompt_template !== null) {
      updateFields.push(`prompt_template = $${paramIndex}`);
      updateValues.push(prompt_template.trim() || null);
      paramIndex++;
    }
    if (is_active !== undefined && is_active !== null) {
      updateFields.push(`is_active = $${paramIndex}`);
      // Convert to boolean properly
      const activeValue = is_active === true || is_active === 'true' || is_active === 1;
      updateValues.push(activeValue);
      paramIndex++;
    }
    if (auto_mode !== undefined && auto_mode !== null) {
      updateFields.push(`auto_mode = $${paramIndex}`);
      const autoValue = auto_mode === true || auto_mode === 'true' || auto_mode === 1;
      updateValues.push(autoValue);
      paramIndex++;
    }
    if (fetching_times !== undefined && fetching_times !== null) {
      updateFields.push(`fetching_times = $${paramIndex}`);
      updateValues.push(fetching_times.trim() || null);
      paramIndex++;
    }

    // Always update updated_at
    updateFields.push(`updated_at = NOW()`);

    // Add WHERE clause parameters
    updateValues.push(websiteId, userId);

    if (updateFields.length === 1) {
      // Only updated_at was updated, which is fine
      const result = await query(
        `UPDATE websites 
         SET updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id, website_url, api_key, website_name, description, niche, sitemap, prompt_template, is_active, updated_at`,
        [websiteId, userId]
      );
      return NextResponse.json({
        message: 'Website updated successfully',
        website: result.rows[0]
      });
    }

    // Build the SQL query
    const sql = `UPDATE websites 
                 SET ${updateFields.join(', ')}
                 WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
                 RETURNING id, website_url, api_key, website_name, description, niche, sitemap, prompt_template, is_active, auto_mode, fetching_times, updated_at`;

    const result = await query(sql, updateValues);

    return NextResponse.json({
      message: 'Website updated successfully',
      website: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating website:', error);
    return NextResponse.json(
      { error: 'Failed to update website', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete a website
export async function DELETE(request, { params }) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = parseInt(session.user.id);
    const resolvedParams = await params;
    const websiteId = parseInt(resolvedParams.id);

    // Validate IDs
    if (!session.user.id || isNaN(userId) || userId <= 0) {
      return NextResponse.json(
        { error: 'Invalid user ID' },
        { status: 400 }
      );
    }

    if (!resolvedParams.id || isNaN(websiteId) || websiteId <= 0) {
      return NextResponse.json(
        { error: 'Invalid website ID' },
        { status: 400 }
      );
    }

    // Verify the website belongs to the user
    const existing = await query(
      'SELECT id FROM websites WHERE id = $1 AND user_id = $2',
      [websiteId, userId]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json(
        { error: 'Website not found or access denied' },
        { status: 404 }
      );
    }

    // Delete website
    await query(
      'DELETE FROM websites WHERE id = $1 AND user_id = $2',
      [websiteId, userId]
    );

    return NextResponse.json({
      message: 'Website deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting website:', error);
    return NextResponse.json(
      { error: 'Failed to delete website', details: error.message },
      { status: 500 }
    );
  }
}

