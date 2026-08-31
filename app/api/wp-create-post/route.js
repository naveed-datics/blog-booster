import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cronAuth";
import { searchCelebrityUrl } from "@/lib/duplicateCheck";
import {
  generateSEOContent,
  buildJsonLd,
  appendPostFooter,
  runPrePublishChecklist,
} from "@/lib/seoContent";

export const maxDuration = 300;

// WordPress Configuration
const WP_BASE =
  process.env.WP_BASE_URL || "https://whatreligionisinfo.com/wp-json/wp/v2";
if (!process.env.WP_AUTH_HEADER) {
  throw new Error(
    "WP_AUTH_HEADER environment variable is not set. Refusing to fall back to a hardcoded credential."
  );
}
const WP_AUTH_HEADER = process.env.WP_AUTH_HEADER;

// The standard WP REST `meta` field on POST /posts silently does NOT
// persist Rank Math's SEO fields (rank_math_title, rank_math_description,
// rank_math_focus_keyword) - verified directly: setting them via the
// normal post-creation payload has no effect on the rendered <title> tag
// or meta description, with no error either, so this failure is invisible
// unless checked. Rank Math exposes its own dedicated endpoint that
// actually writes to the right underlying storage - confirmed working via
// a live test (including its %sep%/%sitename% variable substitution).
async function setRankMathMeta(postId, { title, description, focusKeyword }) {
  try {
    const res = await fetch(`${WP_BASE.replace(/\/wp\/v2$/, "")}/rankmath/v1/updateMeta`, {
      method: "POST",
      headers: { Authorization: WP_AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({
        objectType: "post",
        objectID: postId,
        meta: {
          rank_math_title: title,
          rank_math_description: description,
          rank_math_focus_keyword: focusKeyword,
        },
      }),
    });
    if (!res.ok) {
      console.error(`Rank Math updateMeta failed for post ${postId}: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Rank Math updateMeta error for post ${postId}:`, error);
    return false; // non-fatal - the post itself is already created successfully
  }
}

// Adds internal links in BOTH directions between the new post and a small
// sample of existing posts:
//   - outbound: a "Related Reading" section appended to the new post,
//     linking OUT to existing posts (topical relevance, better UX)
//   - inbound: a short sentence appended to those existing posts, linking
//     back to the new post
// The inbound direction is the one that actually matters most for
// indexing: a brand-new page with zero inbound internal links is exactly
// the kind of page that sits un-indexed, since Google discovers and
// prioritizes crawling pages it can reach via links from pages it already
// knows about. Prefers posts about people confirmed to share the same
// religion (genuinely topical, per Part B's "3-6 topically related people"
// requirement) and falls back to a random sample only when no topical
// match exists in the database yet.
async function addInternalLinks(postId, postTitle, postLink, currentContent, religion) {
  const result = { outbound: false, inbound: 0, linked_to: [] };

  try {
    let chosen = [];

    if (religion) {
      try {
        const { query } = await import("@/lib/db");
        const topical = await query(
          `SELECT post_id, post_title, post_url FROM wordpress_posts
           WHERE religion = $1 AND post_id != $2 AND post_url IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 6`,
          [religion, postId]
        );
        chosen = topical.rows
          .filter((r) => r.post_url)
          .map((r) => ({ id: r.post_id, title: { rendered: r.post_title }, link: r.post_url }));
      } catch (topicalError) {
        console.error("Error finding topically related posts:", topicalError);
      }
    }

    if (chosen.length === 0) {
      const poolRes = await fetch(
        `${WP_BASE}/posts?orderby=date&order=desc&per_page=30&exclude=${postId}&_fields=id,slug,title,link`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!poolRes.ok) return result;

      const pool = await poolRes.json();
      if (!Array.isArray(pool) || pool.length === 0) return result;

      chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(3, pool.length));
    } else {
      chosen = chosen.slice(0, 6);
    }

    // Outbound: append a Related Reading section to the new post.
    const outboundItems = chosen
      .map((p) => `<li><a href="${p.link}">${p.title.rendered}</a></li>`)
      .join("\n");
    const withRelated = `${currentContent}\n\n<h2>Related Reading</h2>\n<ul>\n${outboundItems}\n</ul>`;

    const outboundRes = await fetch(`${WP_BASE}/posts/${postId}`, {
      method: "POST",
      headers: { Authorization: WP_AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({ content: withRelated }),
    });
    result.outbound = outboundRes.ok;
    if (!outboundRes.ok) {
      console.error(`Failed to add outbound links to post ${postId}: ${outboundRes.status}`);
    }

    // Inbound: append a short linking sentence to each chosen existing post.
    for (const p of chosen) {
      try {
        const fullRes = await fetch(`${WP_BASE}/posts/${p.id}?_fields=content`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!fullRes.ok) continue;

        const fullData = await fullRes.json();
        const inboundSentence = `\n\n<p>You might also be interested in <a href="${postLink}">${postTitle}</a>.</p>`;
        const updatedContent = fullData.content.rendered + inboundSentence;

        const inboundRes = await fetch(`${WP_BASE}/posts/${p.id}`, {
          method: "POST",
          headers: { Authorization: WP_AUTH_HEADER, "Content-Type": "application/json" },
          body: JSON.stringify({ content: updatedContent }),
        });

        if (inboundRes.ok) {
          result.inbound++;
          result.linked_to.push(p.link);
        } else {
          console.error(`Failed to add inbound link to post ${p.id}: ${inboundRes.status}`);
        }
      } catch (error) {
        console.error(`Error adding inbound link to post ${p.id}:`, error);
      }
    }

    return result;
  } catch (error) {
    console.error("Error adding internal links:", error);
    return result; // non-fatal - the post itself is already created successfully
  }
}

// Helper function to slugify text
function slugify(s) {
  s = s.trim().toLowerCase();
  s = s.replace(/[^\w\s-]/g, "");
  s = s.replace(/\s+/g, "-");
  s = s.replace(/-{2,}/g, "-");
  return s.trim("-");
}

// Find image using existing image search API
async function findImage(celebrityName, cookies = "", request = null) {
  try {
    // Get base URL from request headers if available
    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    if (request) {
      const host = request.headers.get("host");
      const protocol =
        request.headers.get("x-forwarded-proto") ||
        (request.headers.get("x-forwarded-ssl") === "on" ? "https" : "http");
      if (host) {
        baseUrl = `${protocol}://${host}`;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `${baseUrl}/api/image-search?q=${encodeURIComponent(
        celebrityName
      )}&limit=1`,
      {
        signal: controller.signal,
        headers: {
          Cookie: cookies,
        },
      }
    );

    clearTimeout(timeoutId);

    if (response.ok) {
      // Check if response is JSON (not HTML error page)
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const errorText = await response.text();
        console.error(
          "Image search API returned non-JSON response:",
          errorText.substring(0, 200)
        );
        return null;
      }
      const data = await response.json();
      if (data && typeof data === "object") {
        if (data.url) {
          return data.url;
        }
        if (Array.isArray(data.images) && data.images.length > 0) {
          const first = data.images[0];
          if (first && first.full_size_url) {
            return first.full_size_url;
          }
        }
      }
    } else {
      const errorText = await response.text();
      console.error(
        `Image search API error: ${response.status}`,
        errorText.substring(0, 200)
      );
    }
    return null;
  } catch (error) {
    console.error("Error finding image:", error);
    return null;
  }
}

// GET endpoint for WordPress post creation
export async function GET(request) {
  try {
    // Check authentication
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const postContent = searchParams.get("post_content") || "";
    const keyword = searchParams.get("keyword") || "";
    const websiteId = searchParams.get("website_id") || null;

    if (!keyword.trim()) {
      return NextResponse.json(
        { error: "keyword parameter is required" },
        { status: 400 }
      );
    }

    if (!postContent.trim()) {
      return NextResponse.json(
        { error: "post_content parameter is required" },
        { status: 400 }
      );
    }

    // Step 1: Extract/process input
    const title = keyword.trim();
    let answer = null;
    const answerParam = searchParams.get("answer");
    if (answerParam) {
      try {
        answer = JSON.parse(answerParam);
      } catch (e) {
        console.error("Failed to parse answer query param:", e);
      }
    }
    const focusKeyword = answer?.religion ? `${title} ${answer.religion}` : `${title} religion`;
    const slugVal = slugify(`${title} religion`);

    // Final safety net: re-check for an existing article right here at the
    // actual publish gate, not just earlier in trend-search. This is what
    // was missing during the 2026-08-11 incident - a stale/unvalidated
    // queue entry reached this point and published live as a true
    // duplicate. If this check finds a match, publish as a draft instead
    // of live, so a human can review/discard it rather than it going out
    // to search engines and readers.
    const duplicateUrl = await searchCelebrityUrl(title);
    if (duplicateUrl) {
      console.warn(`⚠️ Duplicate detected at publish time for "${title}" - existing article: ${duplicateUrl}. Publishing as draft instead of live.`);
    }

    const publishedDate = new Date();
    const rawContent = postContent || "";
    const contentHtml = appendPostFooter(rawContent, publishedDate);

    const celebrityName = title;

    // Get cookies from the request to pass to image search API
    const cookies = request.headers.get("cookie") || "";

    // Step 2: Find image (use provided image_url if available, otherwise search)
    const providedImageUrl = searchParams.get("image_url") || null;
    const imageUrl =
      providedImageUrl || (await findImage(celebrityName, cookies, request));

    // Step 3: Generate SEO title & description
    const { seoTitle, metaDescription } = await generateSEOContent(
      celebrityName,
      answer,
      postContent
    );

    // Step 3.5: Append JSON-LD (FAQPage/Article/Person) schema directly
    // into the post content, and run the programmatically-verifiable
    // subset of the pre-publish checklist.
    const jsonLdScript = buildJsonLd({
      celebrityName,
      answer,
      contentHtml,
      postUrl: null,
      seoTitle,
      publishedDate: publishedDate.toISOString(),
    });
    const postContentFinal = contentHtml + jsonLdScript;

    const checklist = runPrePublishChecklist(postContentFinal, { seoTitle });
    if (!checklist.passed) {
      console.warn(
        `⚠️ Pre-publish checklist failed for "${title}": ${checklist.failures.join("; ")}. Publishing as draft instead of live.`
      );
    }
    const forceDraft = Boolean(duplicateUrl) || !checklist.passed;

    const headersJson = {
      Authorization: WP_AUTH_HEADER,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Step 4: Upload image first if available - REQUIRED before post creation
    let mediaId = null;
    if (imageUrl) {
      try {
        // Download image
        const imgController = new AbortController();
        const imgTimeoutId = setTimeout(() => imgController.abort(), 10000);
        const imgResponse = await fetch(imageUrl, {
          signal: imgController.signal,
        });
        clearTimeout(imgTimeoutId);

        if (!imgResponse.ok) {
          return NextResponse.json(
            {
              error: "Failed to download image",
              message: `Image download failed: ${imgResponse.statusText}`,
            },
            { status: 400 }
          );
        }

        const imgData = await imgResponse.arrayBuffer();
        const contentType =
          imgResponse.headers.get("Content-Type") || "image/jpeg";
        const extension =
          {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
            "image/bmp": "bmp",
          }[contentType] || "jpg";

        const randomNumber = Math.floor(Math.random() * 9000) + 1000;
        const filename = `${title
          .toLowerCase()
          .replace(/\s+/g, "-")}-${randomNumber}.${extension}`;

        const mediaHeaders = {
          Authorization: WP_AUTH_HEADER,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Type": contentType,
        };

        // Upload image - REQUIRED for post creation
        const mediaResponse = await fetch(`${WP_BASE}/media`, {
          method: "POST",
          headers: mediaHeaders,
          body: Buffer.from(imgData),
        });

        if (mediaResponse.status !== 201) {
          const errorText = await mediaResponse.text();
          return NextResponse.json(
            {
              error: "Failed to upload featured image",
              message: `Image upload failed: ${mediaResponse.status} ${
                mediaResponse.statusText
              }. ${errorText.substring(0, 200)}`,
            },
            { status: 400 }
          );
        }

        const mediaData = await mediaResponse.json();
        mediaId = mediaData.id;
        console.log(`Image uploaded successfully. Media ID: ${mediaId}`);

        // Set alt text, title, and description
        const patchData = {
          title: focusKeyword,
          alt_text: focusKeyword,
          description: celebrityName,
        };

        const patchResponse = await fetch(`${WP_BASE}/media/${mediaId}`, {
          method: "POST",
          headers: headersJson,
          body: JSON.stringify(patchData),
        });

        if (!patchResponse.ok) {
          console.error(
            `Failed to update media metadata:`,
            await patchResponse.text()
          );
          // Continue even if metadata update fails - image is uploaded
        }
      } catch (error) {
        console.error("Error uploading image before post creation:", error);
        return NextResponse.json(
          {
            error: "Failed to upload featured image",
            message: error.message,
          },
          { status: 500 }
        );
      }
    } else {
      // No image URL found - fail post creation
      return NextResponse.json(
        {
          error: "Featured image is required",
          message: "No image URL found. Post creation aborted.",
        },
        { status: 400 }
      );
    }

    // Step 5: Create post with featured_media - mediaId is required at this point
    if (!mediaId) {
      return NextResponse.json(
        {
          error: "Featured image upload failed",
          message: "Post cannot be created without a featured image",
        },
        { status: 400 }
      );
    }

    const postPayload = {
      title: seoTitle,
      content: postContentFinal,
      status: forceDraft ? "draft" : "publish",
      slug: slugVal,
      author: 2,
      featured_media: mediaId, // Required - post will not be created without it
      meta: {
        rank_math_title: seoTitle,
        rank_math_focus_keyword: focusKeyword,
        rank_math_description: metaDescription,
      },
    };

    const postResponse = await fetch(`${WP_BASE}/posts`, {
      method: "POST",
      headers: headersJson,
      body: JSON.stringify(postPayload),
    });

    if (postResponse.status !== 201) {
      const errorText = await postResponse.text();
      return NextResponse.json(
        {
          error: "Failed to create post",
          status_code: postResponse.status,
          details: errorText,
        },
        { status: postResponse.status }
      );
    }

    const postData = await postResponse.json();
    const postId = postData.id;

    // The `meta` field in the postPayload above does NOT actually persist
    // Rank Math's SEO title/description (see setRankMathMeta comment) -
    // this is the call that actually works.
    const rankMathMetaSaved = await setRankMathMeta(postId, {
      title: seoTitle,
      description: metaDescription,
      focusKeyword: focusKeyword,
    });

    // Add internal links (both directions) between this new post and other
    // posts about people who share the same confirmed religion where
    // possible - see addInternalLinks() for why this matters for indexing.
    const internalLinks = await addInternalLinks(
      postId,
      seoTitle,
      postData.link,
      postContentFinal,
      answer?.religion || null
    );

    // Verify featured_media was set in the post
    if (
      mediaId &&
      (!postData.featured_media || postData.featured_media !== mediaId)
    ) {
      // Featured image wasn't set, try to set it now
      console.log(
        `Featured image not set in post creation, attempting to set now...`
      );
      try {
        const updateResponse = await fetch(`${WP_BASE}/posts/${postId}`, {
          method: "PUT",
          headers: headersJson,
          body: JSON.stringify({ featured_media: mediaId }),
        });

        if (updateResponse.ok) {
          console.log(
            `Featured image ${mediaId} successfully attached to post ${postId}`
          );
        } else {
          const updateErrorText = await updateResponse.text();
          console.error(`Failed to set featured image for post ${postId}:`, {
            status: updateResponse.status,
            error: updateErrorText.substring(0, 200),
          });
        }
      } catch (error) {
        console.error(`Error setting featured image:`, error);
      }
    } else if (mediaId) {
      console.log(`Featured image ${mediaId} was set during post creation`);
    }

    // Fallback code removed - image upload is now required before post creation
    // If mediaId is not set at this point, it means the initial upload failed
    // and the post should not have been created
    if (!mediaId) {
      console.error(
        "CRITICAL: Post was created but mediaId is not set. This should not happen."
      );
    }

    // Save to database via API
    if (websiteId) {
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const saveResponse = await fetch(`${baseUrl}/api/wordpress-posts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: request.headers.get("cookie") || "",
          },
          body: JSON.stringify({
            website_id: parseInt(websiteId),
            celebrity_name: celebrityName,
            post_title: seoTitle,
            post_id: postId,
            post_url: null,
            image_url: imageUrl,
            content: postContentFinal,
            slug: slugVal,
            meta_description: metaDescription,
            religion: answer?.religion || null,
          }),
        });

        if (!saveResponse.ok) {
          console.error(
            "Failed to save WordPress post to database:",
            await saveResponse.text()
          );
        }
      } catch (error) {
        console.error("Error saving WordPress post to database:", error);
      }
    }

    return NextResponse.json({
      status: "success",
      post_id: postId,
      is_likely_duplicate: Boolean(duplicateUrl),
      duplicate_of: duplicateUrl || null,
      wp_post_status: forceDraft ? "draft" : "publish",
      checklist_passed: checklist.passed,
      checklist_failures: checklist.failures,
      rank_math_meta_saved: rankMathMetaSaved,
      internal_links: internalLinks,
      media_id: mediaId || null,
      message: mediaId
        ? `Post ID ${postId} created with featured image ID ${mediaId}`
        : `Post ${postId} created successfully`,
      title: seoTitle,
      meta_description: metaDescription,
      image_url: imageUrl,
      slug: slugVal,
    });
  } catch (error) {
    console.error("Error in wp-create-post API:", error);
    return NextResponse.json(
      {
        error: "Unexpected error",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// POST endpoint (alternative method - handles large content without URL length limits)
export async function POST(request) {
  try {
    // Check authentication
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const postContent = body.post_content || "";
    const keyword = body.keyword || "";
    const websiteId = body.website_id || null;
    const answer = body.answer || null;

    if (!keyword.trim()) {
      return NextResponse.json(
        { error: "keyword is required" },
        { status: 400 }
      );
    }

    if (!postContent.trim()) {
      return NextResponse.json(
        { error: "post_content is required" },
        { status: 400 }
      );
    }

    // Step 1: Extract/process input
    const title = keyword.trim();
    const focusKeyword = answer?.religion ? `${title} ${answer.religion}` : `${title} religion`;
    const slugVal = slugify(`${title} religion`);

    // Final safety net: re-check for an existing article right here at the
    // actual publish gate, not just earlier in trend-search. This is what
    // was missing during the 2026-08-11 incident - a stale/unvalidated
    // queue entry reached this point and published live as a true
    // duplicate. If this check finds a match, publish as a draft instead
    // of live, so a human can review/discard it rather than it going out
    // to search engines and readers.
    const duplicateUrl = await searchCelebrityUrl(title);
    if (duplicateUrl) {
      console.warn(`⚠️ Duplicate detected at publish time for "${title}" - existing article: ${duplicateUrl}. Publishing as draft instead of live.`);
    }

    const publishedDate = new Date();
    const rawContent = postContent || "";
    const contentHtml = appendPostFooter(rawContent, publishedDate);

    const celebrityName = title;

    // Get cookies from the request to pass to image search API
    const cookies = request.headers.get("cookie") || "";

    // Step 2: Find image (use provided image_url if available, otherwise search)
    const providedImageUrl = body.image_url || null;
    const imageUrl =
      providedImageUrl || (await findImage(celebrityName, cookies, request));

    // Step 3: Generate SEO title & description
    const { seoTitle, metaDescription } = await generateSEOContent(
      celebrityName,
      answer,
      postContent
    );

    // Step 3.5: Append JSON-LD (FAQPage/Article/Person) schema directly
    // into the post content, and run the programmatically-verifiable
    // subset of the pre-publish checklist.
    const jsonLdScript = buildJsonLd({
      celebrityName,
      answer,
      contentHtml,
      postUrl: null,
      seoTitle,
      publishedDate: publishedDate.toISOString(),
    });
    const postContentFinal = contentHtml + jsonLdScript;

    const checklist = runPrePublishChecklist(postContentFinal, { seoTitle });
    if (!checklist.passed) {
      console.warn(
        `⚠️ Pre-publish checklist failed for "${title}": ${checklist.failures.join("; ")}. Publishing as draft instead of live.`
      );
    }
    const forceDraft = Boolean(duplicateUrl) || !checklist.passed;

    const headersJson = {
      Authorization: WP_AUTH_HEADER,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Step 4: Upload image first if available - REQUIRED before post creation
    let mediaId = null;
    if (imageUrl) {
      try {
        // Download image
        const imgController = new AbortController();
        const imgTimeoutId = setTimeout(() => imgController.abort(), 10000);
        const imgResponse = await fetch(imageUrl, {
          signal: imgController.signal,
        });
        clearTimeout(imgTimeoutId);

        if (!imgResponse.ok) {
          return NextResponse.json(
            {
              error: "Failed to download image",
              message: `Image download failed: ${imgResponse.statusText}`,
            },
            { status: 400 }
          );
        }

        const imgData = await imgResponse.arrayBuffer();
        const contentType =
          imgResponse.headers.get("Content-Type") || "image/jpeg";
        const extension =
          {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
            "image/bmp": "bmp",
          }[contentType] || "jpg";

        const randomNumber = Math.floor(Math.random() * 9000) + 1000;
        const filename = `${title
          .toLowerCase()
          .replace(/\s+/g, "-")}-${randomNumber}.${extension}`;

        const mediaHeaders = {
          Authorization: WP_AUTH_HEADER,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Type": contentType,
        };

        // Upload image - REQUIRED for post creation
        const mediaResponse = await fetch(`${WP_BASE}/media`, {
          method: "POST",
          headers: mediaHeaders,
          body: Buffer.from(imgData),
        });

        if (mediaResponse.status !== 201) {
          const errorText = await mediaResponse.text();
          return NextResponse.json(
            {
              error: "Failed to upload featured image",
              message: `Image upload failed: ${mediaResponse.status} ${
                mediaResponse.statusText
              }. ${errorText.substring(0, 200)}`,
            },
            { status: 400 }
          );
        }

        const mediaData = await mediaResponse.json();
        mediaId = mediaData.id;
        console.log(`Image uploaded successfully. Media ID: ${mediaId}`);

        // Set alt text, title, and description
        const patchData = {
          title: focusKeyword,
          alt_text: focusKeyword,
          description: celebrityName,
        };

        const patchResponse = await fetch(`${WP_BASE}/media/${mediaId}`, {
          method: "POST",
          headers: headersJson,
          body: JSON.stringify(patchData),
        });

        if (!patchResponse.ok) {
          console.error(
            `Failed to update media metadata:`,
            await patchResponse.text()
          );
          // Continue even if metadata update fails - image is uploaded
        }
      } catch (error) {
        console.error("Error uploading image before post creation:", error);
        return NextResponse.json(
          {
            error: "Failed to upload featured image",
            message: error.message,
          },
          { status: 500 }
        );
      }
    } else {
      // No image URL found - fail post creation
      return NextResponse.json(
        {
          error: "Featured image is required",
          message: "No image URL found. Post creation aborted.",
        },
        { status: 400 }
      );
    }

    // Step 5: Create post with featured_media - mediaId is required at this point
    if (!mediaId) {
      return NextResponse.json(
        {
          error: "Featured image upload failed",
          message: "Post cannot be created without a featured image",
        },
        { status: 400 }
      );
    }

    const postPayload = {
      title: seoTitle,
      content: postContentFinal,
      status: forceDraft ? "draft" : "publish",
      slug: slugVal,
      author: 2,
      featured_media: mediaId, // Required - post will not be created without it
      meta: {
        rank_math_title: seoTitle,
        rank_math_focus_keyword: focusKeyword,
        rank_math_description: metaDescription,
      },
    };

    const postResponse = await fetch(`${WP_BASE}/posts`, {
      method: "POST",
      headers: headersJson,
      body: JSON.stringify(postPayload),
    });

    if (postResponse.status !== 201) {
      const errorText = await postResponse.text();
      return NextResponse.json(
        {
          error: "Failed to create post",
          status_code: postResponse.status,
          details: errorText,
        },
        { status: postResponse.status }
      );
    }

    const postData = await postResponse.json();
    const postId = postData.id;

    // The `meta` field in the postPayload above does NOT actually persist
    // Rank Math's SEO title/description (see setRankMathMeta comment) -
    // this is the call that actually works.
    const rankMathMetaSaved = await setRankMathMeta(postId, {
      title: seoTitle,
      description: metaDescription,
      focusKeyword: focusKeyword,
    });

    // Add internal links (both directions) between this new post and other
    // posts about people who share the same confirmed religion where
    // possible - see addInternalLinks() for why this matters for indexing.
    const internalLinks = await addInternalLinks(
      postId,
      seoTitle,
      postData.link,
      postContentFinal,
      answer?.religion || null
    );

    // Verify featured_media was set in the post
    if (
      mediaId &&
      (!postData.featured_media || postData.featured_media !== mediaId)
    ) {
      // Featured image wasn't set, try to set it now
      console.log(
        `Featured image not set in post creation, attempting to set now...`
      );
      try {
        const updateResponse = await fetch(`${WP_BASE}/posts/${postId}`, {
          method: "PUT",
          headers: headersJson,
          body: JSON.stringify({ featured_media: mediaId }),
        });

        if (updateResponse.ok) {
          console.log(
            `Featured image ${mediaId} successfully attached to post ${postId}`
          );
        } else {
          const updateErrorText = await updateResponse.text();
          console.error(`Failed to set featured image for post ${postId}:`, {
            status: updateResponse.status,
            error: updateErrorText.substring(0, 200),
          });
        }
      } catch (error) {
        console.error(`Error setting featured image:`, error);
      }
    } else if (mediaId) {
      console.log(`Featured image ${mediaId} was set during post creation`);
    }

    // Fallback code removed - image upload is now required before post creation
    // If mediaId is not set at this point, it means the initial upload failed
    // and the post should not have been created
    if (!mediaId) {
      console.error(
        "CRITICAL: Post was created but mediaId is not set. This should not happen."
      );
    }

    // Save to database via API
    if (websiteId) {
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const saveResponse = await fetch(`${baseUrl}/api/wordpress-posts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: request.headers.get("cookie") || "",
          },
          body: JSON.stringify({
            website_id: parseInt(websiteId),
            celebrity_name: celebrityName,
            post_title: seoTitle,
            post_id: postId,
            post_url: null,
            image_url: imageUrl,
            content: postContentFinal,
            slug: slugVal,
            meta_description: metaDescription,
            religion: answer?.religion || null,
          }),
        });

        if (!saveResponse.ok) {
          console.error(
            "Failed to save WordPress post to database:",
            await saveResponse.text()
          );
        }
      } catch (error) {
        console.error("Error saving WordPress post to database:", error);
      }
    }

    return NextResponse.json({
      status: "success",
      post_id: postId,
      is_likely_duplicate: Boolean(duplicateUrl),
      duplicate_of: duplicateUrl || null,
      wp_post_status: forceDraft ? "draft" : "publish",
      checklist_passed: checklist.passed,
      checklist_failures: checklist.failures,
      rank_math_meta_saved: rankMathMetaSaved,
      internal_links: internalLinks,
      media_id: mediaId || null,
      message: mediaId
        ? `Post ID ${postId} created with featured image ID ${mediaId}`
        : `Post ${postId} created successfully`,
      title: seoTitle,
      meta_description: metaDescription,
      image_url: imageUrl,
      slug: slugVal,
    });
  } catch (error) {
    console.error("Error in wp-create-post API (POST):", error);
    return NextResponse.json(
      {
        error: "Unexpected error",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
