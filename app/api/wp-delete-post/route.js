import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

const WP_BASE =
  process.env.WP_BASE_URL || "https://whatreligionisinfo.com/wp-json/wp/v2";
const WP_AUTH_HEADER =
  process.env.WP_AUTH_HEADER || "Basic YWRtaW46YWRtaW5Ad29yazEyMw==";

const wpHeaders = {
  Authorization: WP_AUTH_HEADER,
  Accept: "application/json",
};

function slugFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : null;
  } catch {
    return null;
  }
}

async function findPostIdBySlug(slug) {
  if (!slug) return null;

  const response = await fetch(
    `${WP_BASE}/posts?slug=${encodeURIComponent(slug)}&status=any&per_page=1`,
    { headers: wpHeaders }
  );

  if (!response.ok) {
    console.error(
      `Failed to lookup post by slug "${slug}":`,
      response.status,
      await response.text()
    );
    return null;
  }

  const posts = await response.json();
  if (Array.isArray(posts) && posts.length > 0) {
    return posts[0].id;
  }
  return null;
}

async function getFeaturedMediaId(postId) {
  const response = await fetch(`${WP_BASE}/posts/${postId}`, {
    headers: wpHeaders,
  });

  if (!response.ok) {
    return null;
  }

  const post = await response.json();
  const mediaId = post?.featured_media;
  return mediaId && mediaId > 0 ? mediaId : null;
}

async function deleteWordPressPost(postId) {
  const response = await fetch(
    `${WP_BASE}/posts/${postId}?force=true`,
    { method: "DELETE", headers: wpHeaders }
  );

  if (response.status === 404) {
    return { deleted: false, notFound: true };
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to delete WordPress post ${postId}: ${response.status} ${errorText.substring(0, 200)}`
    );
  }

  return { deleted: true, notFound: false };
}

async function deleteWordPressMedia(mediaId) {
  const response = await fetch(
    `${WP_BASE}/media/${mediaId}?force=true`,
    { method: "DELETE", headers: wpHeaders }
  );

  if (response.status === 404) {
    return { deleted: false, notFound: true };
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to delete media ${mediaId}: ${response.status} ${errorText.substring(0, 200)}`
    );
  }

  return { deleted: true, notFound: false };
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const websiteId = body.website_id;
    const celebrityName = (body.celebrity_name || "").trim();
    const postUrl = body.post_url || null;

    if (!websiteId || !celebrityName) {
      return NextResponse.json(
        { error: "website_id and celebrity_name are required" },
        { status: 400 }
      );
    }

    const postIdsToDelete = new Set();

    const dbResult = await query(
      `SELECT post_id FROM wordpress_posts
       WHERE website_id = $1 AND celebrity_name = $2`,
      [parseInt(websiteId), celebrityName]
    );

    dbResult.rows.forEach((row) => {
      if (row.post_id) postIdsToDelete.add(row.post_id);
    });

    if (postIdsToDelete.size === 0 && postUrl) {
      const slug = slugFromUrl(postUrl);
      const postId = await findPostIdBySlug(slug);
      if (postId) postIdsToDelete.add(postId);
    }

    const deletedPosts = [];
    const deletedMedia = [];

    for (const postId of postIdsToDelete) {
      const mediaId = await getFeaturedMediaId(postId);
      const postResult = await deleteWordPressPost(postId);
      if (postResult.deleted) {
        deletedPosts.push(postId);
      }

      if (mediaId) {
        try {
          const mediaResult = await deleteWordPressMedia(mediaId);
          if (mediaResult.deleted) {
            deletedMedia.push(mediaId);
          }
        } catch (mediaError) {
          console.error(`Error deleting media ${mediaId}:`, mediaError);
        }
      }
    }

    const dbDeleteResult = await query(
      `DELETE FROM wordpress_posts
       WHERE website_id = $1 AND celebrity_name = $2
       RETURNING id`,
      [parseInt(websiteId), celebrityName]
    );

    return NextResponse.json({
      success: true,
      deleted_posts: deletedPosts,
      deleted_media: deletedMedia,
      deleted_db_rows: dbDeleteResult.rowCount,
      message:
        deletedPosts.length > 0 || dbDeleteResult.rowCount > 0
          ? "Old article and image removed"
          : "No WordPress post found to delete; database records cleared if any",
    });
  } catch (error) {
    console.error("Error in wp-delete-post API:", error);
    return NextResponse.json(
      {
        error: "Failed to delete WordPress post",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
