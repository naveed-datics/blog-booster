import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized } from "@/lib/cronAuth";
import { upsertPersonPage } from "@/lib/personIndex";

// GET endpoint to check if a WordPress post exists for a celebrity/website
export async function GET(request) {
  try {
    if (!(await isAuthorized(request))) {
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
    if (!(await isAuthorized(request))) {
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
      religion,
      wp_status,
      content_quality,
      last_reviewed,
      canonical_slug,
    } = body;

    // Validation
    if (!website_id || !celebrity_name || !post_title) {
      return NextResponse.json(
        {
          error: "website_id, celebrity_name, and post_title are required",
        },
        { status: 400 }
      );
    }

    const post = await upsertPersonPage({
      websiteId: website_id,
      celebrityName: celebrity_name,
      postId: post_id ? parseInt(post_id, 10) : null,
      postTitle: post_title,
      postUrl: post_url || null,
      imageUrl: image_url || null,
      content: content || null,
      slug: slug || null,
      metaDescription: meta_description || null,
      religion: religion || null,
      wpStatus: wp_status || "publish",
      contentQuality: content_quality || "unknown",
      lastReviewed: last_reviewed || null,
      canonicalSlug: canonical_slug || null,
    });

    return NextResponse.json({
      success: true,
      message: "WordPress post saved",
      post,
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



