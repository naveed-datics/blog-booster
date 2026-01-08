import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";

// GET endpoint to check if a WordPress post exists for a celebrity/website
export async function GET(request) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const websiteId = searchParams.get("website_id");
    const celebrityName = searchParams.get("celebrity_name");

    if (!websiteId || !celebrityName) {
      return NextResponse.json(
        { error: "website_id and celebrity_name are required" },
        { status: 400 }
      );
    }

    // Check if post exists
    const result = await query(
      "SELECT * FROM wordpress_posts WHERE website_id = $1 AND celebrity_name = $2 ORDER BY created_at DESC LIMIT 1",
      [parseInt(websiteId), celebrityName.trim()]
    );

    if (result.rows.length > 0) {
      return NextResponse.json({
        exists: true,
        post: result.rows[0],
      });
    }

    return NextResponse.json({
      exists: false,
      post: null,
    });
  } catch (error) {
    console.error("Error checking WordPress post:", error);
    return NextResponse.json(
      {
        error: "Failed to check WordPress post",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// POST endpoint to save WordPress post data
export async function POST(request) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      website_id,
      celebrity_name,
      post_title,
      post_id,
      post_url,
      image_url,
      content,
      slug,
      meta_description,
    } = body;

    // Validation
    if (!website_id || !celebrity_name || !post_title || !post_id) {
      return NextResponse.json(
        {
          error: "website_id, celebrity_name, post_title, and post_id are required",
        },
        { status: 400 }
      );
    }

    // Check if post already exists
    const existing = await query(
      "SELECT id FROM wordpress_posts WHERE website_id = $1 AND celebrity_name = $2 AND post_id = $3",
      [parseInt(website_id), celebrity_name.trim(), parseInt(post_id)]
    );

    if (existing.rows.length > 0) {
      // Update existing post
      const result = await query(
        `UPDATE wordpress_posts 
         SET post_title = $1, post_url = $2, image_url = $3, content = $4, slug = $5, meta_description = $6, updated_at = NOW()
         WHERE website_id = $7 AND celebrity_name = $8 AND post_id = $9
         RETURNING *`,
        [
          post_title,
          post_url || null,
          image_url || null,
          content || null,
          slug || null,
          meta_description || null,
          parseInt(website_id),
          celebrity_name.trim(),
          parseInt(post_id),
        ]
      );

      return NextResponse.json({
        success: true,
        message: "WordPress post updated",
        post: result.rows[0],
      });
    }

    // Insert new post
    const result = await query(
      `INSERT INTO wordpress_posts 
       (website_id, celebrity_name, post_title, post_id, post_url, image_url, content, slug, meta_description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        parseInt(website_id),
        celebrity_name.trim(),
        post_title,
        parseInt(post_id),
        post_url || null,
        image_url || null,
        content || null,
        slug || null,
        meta_description || null,
      ]
    );

    return NextResponse.json({
      success: true,
      message: "WordPress post saved",
      post: result.rows[0],
    });
  } catch (error) {
    console.error("Error saving WordPress post:", error);
    return NextResponse.json(
      {
        error: "Failed to save WordPress post",
        message: error.message,
      },
      { status: 500 }
    );
  }
}



