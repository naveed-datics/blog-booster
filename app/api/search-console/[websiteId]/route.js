import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { fetchAllSitemapUrls } from "@/lib/sitemap";
import {
  clearInspectionCache,
  fetchSearchAnalyticsPages,
  getAuthenticatedClient,
  getCachedUrlList,
  hasOAuthConfig,
  inspectUrlsWithConcurrency,
  resolveSiteUrl,
  setCachedUrlList,
} from "@/lib/google-search-console";

export const maxDuration = 60;

const DEFAULT_BATCH_LIMIT = 8;
const MAX_BATCH_LIMIT = 10;
const INSPECTION_CONCURRENCY = 3;

async function verifyWebsiteAccess(userId, websiteId) {
  const result = await query(
    "SELECT id, website_url, sitemap FROM websites WHERE id = $1 AND user_id = $2",
    [websiteId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

async function buildUrlList(authClient, siteUrl, sitemapUrl) {
  const urlSet = new Set();

  if (sitemapUrl?.trim()) {
    try {
      const sitemapUrls = await fetchAllSitemapUrls(sitemapUrl.trim());
      sitemapUrls.forEach(({ url }) => urlSet.add(url));
    } catch (error) {
      console.error("Failed to fetch sitemap URLs:", error);
    }
  }

  try {
    const gscPages = await fetchSearchAnalyticsPages(authClient, siteUrl, 90);
    gscPages.forEach((url) => urlSet.add(url));
  } catch (error) {
    console.error("Failed to fetch GSC analytics pages:", error);
  }

  return Array.from(urlSet).sort();
}

async function resolveUrlList(authClient, website, websiteId, refresh) {
  if (!refresh) {
    const cachedList = await getCachedUrlList(websiteId);
    if (cachedList) {
      return cachedList;
    }
  }

  const siteUrl = await resolveSiteUrl(authClient, website.website_url);
  const urls = await buildUrlList(authClient, siteUrl, website.sitemap);
  await setCachedUrlList(websiteId, siteUrl, urls);

  return { siteUrl, urls };
}

export async function GET(request, { params }) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const resolvedParams = await params;
    const websiteId = parseInt(resolvedParams.websiteId);

    if (Number.isNaN(websiteId)) {
      return NextResponse.json({ error: "Invalid website ID" }, { status: 400 });
    }

    const website = await verifyWebsiteAccess(userId, websiteId);
    if (!website) {
      return NextResponse.json(
        { error: "Website not found or access denied" },
        { status: 404 }
      );
    }

    const oauthConfigured = await hasOAuthConfig(userId);
    if (!oauthConfigured) {
      return NextResponse.json(
        {
          success: false,
          needsOAuthConfig: true,
          error: "Google OAuth not configured. Add Client ID and Client Secret in Manage Websites.",
        },
        { status: 400 }
      );
    }

    const authClient = await getAuthenticatedClient(userId);
    if (!authClient) {
      return NextResponse.json(
        { success: false, needsAuth: true, error: "Google Search Console not connected" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));
    const limit = Math.min(
      MAX_BATCH_LIMIT,
      Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_BATCH_LIMIT), 10))
    );
    const refresh = searchParams.get("refresh") === "true";

    if (refresh) {
      await clearInspectionCache(websiteId);
    }

    const { siteUrl, urls: allUrls } = await resolveUrlList(
      authClient,
      website,
      websiteId,
      refresh
    );

    if (allUrls.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          siteUrl,
          scan: {
            totalUrls: 0,
            inspected: 0,
            offset,
            limit,
            hasMore: false,
          },
          noIndexPages: [],
          issues: [],
        },
        meta: {
          disclaimer:
            "No URLs found. Configure a sitemap URL on this website or ensure GSC has page data.",
        },
      });
    }

    const batchUrls = allUrls.slice(offset, offset + limit);
    const { noIndexPages, issues } = await inspectUrlsWithConcurrency(
      authClient,
      websiteId,
      siteUrl,
      batchUrls,
      { concurrency: INSPECTION_CONCURRENCY, refresh }
    );

    const hasMore = offset + limit < allUrls.length;

    return NextResponse.json({
      success: true,
      data: {
        siteUrl,
        scan: {
          totalUrls: allUrls.length,
          inspected: batchUrls.length,
          offset,
          limit,
          hasMore,
          nextOffset: hasMore ? offset + limit : null,
        },
        noIndexPages,
        issues,
      },
      meta: {
        disclaimer:
          "Derived from Google URL Inspection API. Large sites scan in batches (~2,000/day quota). Rewrite/reindex actions coming in a later phase.",
      },
    });
  } catch (error) {
    console.error("GSC scan error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch Search Console data",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
