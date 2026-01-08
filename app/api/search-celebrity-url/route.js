import { NextResponse } from "next/server";
import { parseString } from "xml2js";
import { promisify } from "util";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";

const parseStringAsync = promisify(parseString);

/**
 * Fetch and parse sitemap index to find all post-sitemap URLs
 */
async function fetchSitemapIndex(sitemapIndexUrl) {
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };

    const response = await fetch(sitemapIndexUrl, {
      headers,
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xmlText = await response.text();
    const result = await parseStringAsync(xmlText);

    // Extract sitemap URLs from sitemapindex structure
    const sitemapUrls = [];
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      result.sitemapindex.sitemap.forEach((sitemapEntry) => {
        if (sitemapEntry.loc && sitemapEntry.loc[0]) {
          const sitemapUrl = sitemapEntry.loc[0];
          // Only include post-sitemap URLs
          if (sitemapUrl.includes("post-sitemap")) {
            sitemapUrls.push(sitemapUrl);
          }
        }
      });
    }

    return sitemapUrls;
  } catch (error) {
    console.error(`Error fetching sitemap index ${sitemapIndexUrl}:`, error);
    return [];
  }
}

/**
 * Fetch URLs from a sitemap XML
 */
async function fetchSitemapUrls(sitemapUrl) {
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };

    const response = await fetch(sitemapUrl, {
      headers,
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xmlText = await response.text();

    // Parse XML
    const result = await parseStringAsync(xmlText);

    // Extract URLs and lastmod dates from sitemap structure
    const urlData = [];
    if (result.urlset && result.urlset.url) {
      result.urlset.url.forEach((urlEntry) => {
        if (urlEntry.loc && urlEntry.loc[0]) {
          const url = urlEntry.loc[0];
          const lastmod =
            urlEntry.lastmod && urlEntry.lastmod[0]
              ? urlEntry.lastmod[0]
              : null;
          urlData.push({ url, lastmod });
        }
      });
    }

    return urlData;
  } catch (error) {
    console.error(`Error fetching sitemap ${sitemapUrl}:`, error);
    return [];
  }
}

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

    // Fetch sitemap URL from database
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
    const postSitemapUrls = await fetchSitemapIndex(sitemapIndexUrl);

    if (postSitemapUrls.length === 0) {
      return NextResponse.json({
        celebrity_name: celebrityName,
        url: null,
        found: false,
        message: "No post-sitemap URLs found in sitemap index",
      });
    }

    console.log(
      `Found ${postSitemapUrls.length} post-sitemap URLs:`,
      postSitemapUrls
    );

    // Fetch URLs and lastmod dates from all post-sitemaps and merge them
    const allUrlData = [];
    for (const sitemapUrl of postSitemapUrls) {
      const urlData = await fetchSitemapUrls(sitemapUrl);
      allUrlData.push(...urlData);
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
