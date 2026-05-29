import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";
import { fetchPostSitemapPageUrls } from "@/lib/sitemap";

/**
 * Search for celebrity URL in sitemaps
 */
export async function GET(request) {
  try {
    // Check authentication
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const celebrityName =
      searchParams.get("celebrity_name") ||
      searchParams.get("keyword") ||
      searchParams.get("q");
    const websiteId = searchParams.get("website_id");

    if (!celebrityName || !celebrityName.trim()) {
      return NextResponse.json(
        { error: "celebrity_name, keyword, or q parameter is required" },
        { status: 400 }
      );
    }

    if (!websiteId) {
      return NextResponse.json(
        { error: "website_id parameter is required" },
        { status: 400 }
      );
    }

    console.log(
      `Searching for celebrity: ${celebrityName} in website: ${websiteId}`
    );

    // STEP 1: Check wordpress_posts table first to avoid duplication
    try {
      const existingPost = await query(
        "SELECT post_url, updated_at FROM wordpress_posts WHERE website_id = $1 AND celebrity_name = $2 ORDER BY created_at DESC LIMIT 1",
        [parseInt(websiteId), celebrityName.trim()]
      );

      if (existingPost.rows.length > 0 && existingPost.rows[0].post_url) {
        console.log(
          `Found existing WordPress post in database for ${celebrityName}: ${existingPost.rows[0].post_url}`
        );
        return NextResponse.json({
          celebrity_name: celebrityName,
          url: existingPost.rows[0].post_url,
          lastmod: existingPost.rows[0].updated_at || null,
          found: true,
          source: "database",
        });
      }
    } catch (dbError) {
      console.error(
        "Error checking wordpress_posts table for existing post:",
        dbError
      );
      // Continue to sitemap check even if DB check fails
    }

    // STEP 2: Fallback to sitemap check when no DB record is found
    const websiteResult = await query(
      "SELECT sitemap FROM websites WHERE id = $1",
      [parseInt(websiteId)]
    );

    if (websiteResult.rows.length === 0) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    const sitemapIndexUrl = websiteResult.rows[0].sitemap;

    if (!sitemapIndexUrl || !sitemapIndexUrl.trim()) {
      return NextResponse.json(
        { error: "Sitemap URL not configured for this website" },
        { status: 400 }
      );
    }

    console.log(`Fetching sitemap index from: ${sitemapIndexUrl}`);

    // Fetch all post-sitemap URLs from the sitemap index
    const allUrlData = await fetchPostSitemapPageUrls(sitemapIndexUrl);

    if (allUrlData.length === 0) {
      return NextResponse.json({
        celebrity_name: celebrityName,
        url: null,
        found: false,
        message: "No post-sitemap URLs found in sitemap index",
      });
    }

    // Create a map of URL to lastmod for quick lookup
    const urlToLastmod = {};
    allUrlData.forEach(({ url, lastmod }) => {
      urlToLastmod[url] = lastmod;
    });

    const allUrls = allUrlData.map((item) => item.url);
    console.log(`Total URLs fetched: ${allUrls.length}`);

    // Check if URLs are available
    if (allUrls.length === 0) {
      return NextResponse.json({
        celebrity_name: celebrityName,
        url: null,
        message: "No URLs found in sitemaps",
      });
    }

    // Sanitize the celebrity name for matching in URL (lowercase and hyphenated)
    const sanitizedName = celebrityName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-");
    console.log(`Sanitized name: ${sanitizedName}`);

    // Filter URLs to only those that contain the sanitized celebrity name
    const filteredUrls = allUrls.filter((url) => {
      const urlLower = url.toLowerCase();
      return urlLower.includes(sanitizedName);
    });

    console.log(
      `Filtered ${filteredUrls.length} URLs containing '${sanitizedName}'`
    );

    // If there are matching URLs, proceed to find the correct one
    if (filteredUrls.length > 0) {
      // Escape special regex characters in sanitized name
      const escapedName = sanitizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Create regex pattern to match: "celebrity-name-religion" or "what-religion-is-celebrity-name"
      const pattern = new RegExp(
        `(${escapedName}-religion|what-religion-is-${escapedName})`,
        "i"
      );

      // Find the first URL that matches the pattern
      for (const url of filteredUrls) {
        if (pattern.test(url.toLowerCase())) {
          console.log(`Found matching URL: ${url}`);
          return NextResponse.json({
            celebrity_name: celebrityName,
            url: url,
            lastmod: urlToLastmod[url] || null,
            found: true,
          });
        }
      }

      // If no exact pattern match, return the first filtered URL
      const firstUrl = filteredUrls[0];
      console.log(
        `No exact pattern match, returning first filtered URL: ${firstUrl}`
      );
      return NextResponse.json({
        celebrity_name: celebrityName,
        url: firstUrl,
        lastmod: urlToLastmod[firstUrl] || null,
        found: true,
        exact_match: false,
      });
    }

    // If no matching URL is found
    console.log(`No matching URL found for ${celebrityName}`);
    return NextResponse.json({
      celebrity_name: celebrityName,
      url: null,
      found: false,
      message: `No matching URL found for ${celebrityName}`,
    });
  } catch (error) {
    console.error("Error in search-celebrity-url API:", error);
    return NextResponse.json(
      { error: "Failed to search celebrity URL", details: error.message },
      { status: 500 }
    );
  }
}
