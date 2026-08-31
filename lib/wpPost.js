import { searchCelebrityUrl } from "@/lib/duplicateCheck";
import {
  generateSEOContent,
  buildJsonLd,
  appendPostFooter,
  runPrePublishChecklist,
} from "@/lib/seoContent";

// WordPress Configuration
const WP_BASE =
  process.env.WP_BASE_URL || "https://whatreligionisinfo.com/wp-json/wp/v2";
if (!process.env.WP_AUTH_HEADER) {
  throw new Error(
    "WP_AUTH_HEADER environment variable is not set. Refusing to fall back to a hardcoded credential."
  );
}
const WP_AUTH_HEADER = process.env.WP_AUTH_HEADER;

function slugify(s) {
  s = s.trim().toLowerCase();
  s = s.replace(/[^\w\s-]/g, "");
  s = s.replace(/\s+/g, "-");
  s = s.replace(/-{2,}/g, "-");
  return s.trim("-");
}

// The standard WP REST `meta` field on POST /posts silently does NOT
// persist Rank Math's SEO fields (rank_math_title, rank_math_description,
// rank_math_focus_keyword) - verified directly. Rank Math exposes its own
// dedicated endpoint that actually writes to the right underlying storage.
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
    return false;
  }
}

// Adds internal links in BOTH directions between the new post and other
// posts about people who share the same confirmed religion where possible,
// falling back to a random recent sample otherwise.
export async function addInternalLinks(postId, postTitle, postLink, currentContent, religion) {
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
    return result;
  }
}

// Finds a candidate image URL via image-search. Only called AFTER a post
// has already been created, so a failed/slow/quota-exhausted image search
// never blocks or wastes cost on an article that turns out not to publish.
async function findImage(celebrityName, cookies = "", request = null) {
  try {
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
      `${baseUrl}/api/image-search?q=${encodeURIComponent(celebrityName)}&limit=1`,
      {
        signal: controller.signal,
        headers: { Cookie: cookies },
      }
    );

    clearTimeout(timeoutId);

    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        console.error("Image search API returned non-JSON response");
        return null;
      }
      const data = await response.json();
      if (data && typeof data === "object") {
        if (data.url) return data.url;
        if (Array.isArray(data.images) && data.images.length > 0) {
          const first = data.images[0];
          if (first && first.full_size_url) return first.full_size_url;
        }
      }
    } else {
      console.error(`Image search API error: ${response.status}`);
    }
    return null;
  } catch (error) {
    console.error("Error finding image:", error);
    return null;
  }
}

// Downloads imageUrl, uploads it to the WP media library, and attaches it
// as the post's featured image. Best-effort: any failure here is logged
// and swallowed - the post itself was already created and published (or
// not, per the checklist), and a missing featured image is not worth
// retrying or un-publishing over.
async function attachFeaturedImage(postId, imageUrl, title, celebrityName) {
  try {
    const imgController = new AbortController();
    const imgTimeoutId = setTimeout(() => imgController.abort(), 10000);
    const imgResponse = await fetch(imageUrl, { signal: imgController.signal });
    clearTimeout(imgTimeoutId);

    if (!imgResponse.ok) {
      console.error(`Failed to download image for post ${postId}: ${imgResponse.status}`);
      return null;
    }

    const imgData = await imgResponse.arrayBuffer();
    const contentType = imgResponse.headers.get("Content-Type") || "image/jpeg";
    const extension =
      {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/bmp": "bmp",
      }[contentType] || "jpg";

    const randomNumber = Math.floor(Math.random() * 9000) + 1000;
    const filename = `${title.toLowerCase().replace(/\s+/g, "-")}-${randomNumber}.${extension}`;

    const mediaResponse = await fetch(`${WP_BASE}/media`, {
      method: "POST",
      headers: {
        Authorization: WP_AUTH_HEADER,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": contentType,
      },
      body: Buffer.from(imgData),
    });

    if (mediaResponse.status !== 201) {
      console.error(`Failed to upload featured image for post ${postId}: ${mediaResponse.status}`);
      return null;
    }

    const mediaData = await mediaResponse.json();
    const mediaId = mediaData.id;

    const focusKeyword = title;
    await fetch(`${WP_BASE}/media/${mediaId}`, {
      method: "POST",
      headers: { Authorization: WP_AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: focusKeyword,
        alt_text: focusKeyword,
        description: celebrityName,
      }),
    }).catch((error) => console.error(`Failed to set media metadata for post ${postId}:`, error));

    const attachResponse = await fetch(`${WP_BASE}/posts/${postId}`, {
      method: "PUT",
      headers: { Authorization: WP_AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({ featured_media: mediaId }),
    });

    if (!attachResponse.ok) {
      console.error(`Failed to attach featured image to post ${postId}: ${attachResponse.status}`);
      return null;
    }

    return mediaId;
  } catch (error) {
    console.error(`Error attaching featured image to post ${postId}:`, error);
    return null;
  }
}

// Core post-creation logic shared by the GET and POST handlers.
//
// Order of operations (changed from the old image-first flow to save API
// cost on articles that never end up publishing):
//   1. Build the final content + schema, run the pre-publish checklist.
//   2. If a duplicate exists OR the checklist fails: do NOT create anything
//      in WordPress. Return a `skipped` result with a reason - no draft
//      clutter, no image search spent on content that won't ship.
//   3. Otherwise create the post directly as `publish` (no human review
//      step) with no featured image yet.
//   4. Only now search for and attach an image, best-effort - a failure
//      here does not unpublish or retry the post.
export async function createWordPressPost({
  title,
  postContent,
  websiteId,
  answer,
  cookies,
  request,
}) {
  const celebrityName = title;
  const focusKeyword = answer?.religion ? `${title} ${answer.religion}` : `${title} religion`;
  const slugVal = slugify(`${title} religion`);

  const duplicateUrl = await searchCelebrityUrl(title);

  const publishedDate = new Date();
  const contentHtml = appendPostFooter(postContent || "", publishedDate);

  const { seoTitle, metaDescription } = await generateSEOContent(
    celebrityName,
    answer,
    postContent
  );

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

  if (duplicateUrl) {
    return {
      skipped: true,
      skipStage: "duplicate",
      skipDetail: `existing article: ${duplicateUrl}`,
    };
  }

  if (!checklist.passed) {
    return {
      skipped: true,
      skipStage: "checklist-failed",
      skipDetail: checklist.failures.join("; "),
    };
  }

  const headersJson = {
    Authorization: WP_AUTH_HEADER,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const postPayload = {
    title: seoTitle,
    content: postContentFinal,
    status: "publish",
    slug: slugVal,
    author: 2,
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
    throw Object.assign(
      new Error(`Failed to create post: ${postResponse.status} ${errorText.substring(0, 300)}`),
      { statusCode: postResponse.status }
    );
  }

  const postData = await postResponse.json();
  const postId = postData.id;

  const rankMathMetaSaved = await setRankMathMeta(postId, {
    title: seoTitle,
    description: metaDescription,
    focusKeyword,
  });

  const internalLinks = await addInternalLinks(
    postId,
    seoTitle,
    postData.link,
    postContentFinal,
    answer?.religion || null
  );

  // Image search + upload + attach now happens AFTER the post is live -
  // saves the image-search/upload API cost entirely on anything that was
  // skipped above, and a failure here never blocks publication.
  let mediaId = null;
  let imageUrl = null;
  try {
    imageUrl = await findImage(celebrityName, cookies, request);
    if (imageUrl) {
      mediaId = await attachFeaturedImage(postId, imageUrl, seoTitle, celebrityName);
    }
  } catch (error) {
    console.error(`Error during post-publish image attach for post ${postId}:`, error);
  }

  if (websiteId) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const saveResponse = await fetch(`${baseUrl}/api/wordpress-posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookies || "",
        },
        body: JSON.stringify({
          website_id: parseInt(websiteId),
          celebrity_name: celebrityName,
          post_title: seoTitle,
          post_id: postId,
          post_url: postData.link || null,
          image_url: imageUrl,
          content: postContentFinal,
          slug: slugVal,
          meta_description: metaDescription,
          religion: answer?.religion || null,
        }),
      });
      if (!saveResponse.ok) {
        console.error("Failed to save WordPress post to database:", await saveResponse.text());
      }
    } catch (error) {
      console.error("Error saving WordPress post to database:", error);
    }
  }

  return {
    skipped: false,
    status: "success",
    post_id: postId,
    wp_post_status: "publish",
    checklist_passed: checklist.passed,
    checklist_failures: checklist.failures,
    rank_math_meta_saved: rankMathMetaSaved,
    internal_links: internalLinks,
    media_id: mediaId,
    message: mediaId
      ? `Post ID ${postId} published with featured image ID ${mediaId}`
      : `Post ${postId} published (no featured image attached)`,
    title: seoTitle,
    meta_description: metaDescription,
    image_url: imageUrl,
    slug: slugVal,
    link: postData.link || null,
  };
}
