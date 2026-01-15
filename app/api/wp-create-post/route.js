import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// WordPress Configuration
const WP_BASE =
  process.env.WP_BASE_URL || "https://whatreligionisinfo.com/wp-json/wp/v2";
const WP_AUTH_HEADER =
  process.env.WP_AUTH_HEADER || "Basic YWRtaW46YWRtaW5Ad29yazEyMw==";

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

// Generate SEO title and meta description using Azure OpenAI
async function generateSEOContent(focusKeyword, title, postContent) {
  let seoTitle = focusKeyword;
  let metaDescription = `Discover ${title}'s religious background and beliefs. Learn more about ${focusKeyword}.`;

  try {
    // Get Azure OpenAI config
    let azureApiKey = process.env.AZURE_OPENAI_API_KEY;
    let azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    let azureDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    let azureApiVersion =
      process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

    // Remove quotes if present
    if (azureApiKey) azureApiKey = azureApiKey.replace(/^["']|["']$/g, "");
    if (azureEndpoint)
      azureEndpoint = azureEndpoint.replace(/^["']|["']$/g, "");
    if (azureDeploymentName)
      azureDeploymentName = azureDeploymentName.replace(/^["']|["']$/g, "");
    if (azureApiVersion)
      azureApiVersion = azureApiVersion.replace(/^["']|["']$/g, "");

    const useAzure = azureApiKey && azureEndpoint && azureDeploymentName;

    if (useAzure) {
      const endpoint = azureEndpoint.replace(/\/$/, "");
      const azureUrl = `${endpoint}/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion}`;

      // Generate SEO Title following RankMath SEO guidelines
      try {
        const titleResponse = await fetch(azureUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": azureApiKey,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `You are an SEO assistant following RankMath SEO guidelines. Create one SEO-optimized title that:
- Includes the focus keyword '${focusKeyword}' naturally
- Is 50-60 characters long (optimal for search engines)
- Is compelling and click-worthy
- Does NOT include quotes or quotation marks
- Does NOT wrap the title in quotes
- Is written in title case
Return only the title text, no quotes, no commentary.`,
              },
              {
                role: "user",
                content: title,
              },
            ],
            temperature: 0.3,
            max_tokens: 100,
          }),
        });

        if (titleResponse.ok) {
          const titleData = await titleResponse.json();
          const candidate = titleData.choices?.[0]?.message?.content;
          if (candidate && candidate.trim()) {
            // Remove any quotes that might be in the response
            seoTitle = candidate
              .trim()
              .replace(/^["']|["']$/g, "")
              .trim();
          }
        }
      } catch (error) {
        console.error("Error generating SEO title:", error);
      }

      // Generate Meta Description
      try {
        const descResponse = await fetch(azureUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": azureApiKey,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `You are an SEO assistant. Write one meta description (150–160 chars) for '${focusKeyword}' make sure '${focusKeyword}' in description.`,
              },
              {
                role: "user",
                content: postContent.substring(0, 500), // small context
              },
            ],
            temperature: 0.3,
            max_tokens: 200,
          }),
        });

        if (descResponse.ok) {
          const descData = await descResponse.json();
          const candidate = descData.choices?.[0]?.message?.content;
          if (candidate && candidate.trim()) {
            metaDescription = candidate.trim();
          }
        }
      } catch (error) {
        console.error("Error generating meta description:", error);
      }
    }
  } catch (error) {
    console.error("Error in SEO generation:", error);
  }

  return { seoTitle, metaDescription };
}

// GET endpoint for WordPress post creation
export async function GET(request) {
  try {
    // Check authentication
    const session = await auth();
    if (!session || !session.user) {
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
    const focusKeyword = `${title} religion`.trim();
    const slugVal = slugify(focusKeyword);

    const rawContent = postContent || "";
    const isHtml = /<\s*[a-zA-Z][^>]*>/.test(rawContent);
    let contentHtml = rawContent;

    // Add internal link
    const internalLink =
      "<p>If you are interested in learning more about religion, please visit " +
      '<a href="https://whatreligionisinfo.com/">whatreligionisinfo.com</a>.</p>';
    contentHtml += internalLink;

    const celebrityName = title;

    // Get cookies from the request to pass to image search API
    const cookies = request.headers.get("cookie") || "";

    // Step 2: Find image (use provided image_url if available, otherwise search)
    const providedImageUrl = searchParams.get("image_url") || null;
    const imageUrl =
      providedImageUrl || (await findImage(celebrityName, cookies, request));

    // Step 3: Generate SEO title & description
    const { seoTitle, metaDescription } = await generateSEOContent(
      focusKeyword,
      title,
      postContent
    );

    // Combine meta description and content
    const postContentFinal = metaDescription + "\n\n" + contentHtml;

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
      status: "published",
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
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const postContent = body.post_content || "";
    const keyword = body.keyword || "";
    const websiteId = body.website_id || null;

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
    const focusKeyword = `${title} religion`.trim();
    const slugVal = slugify(focusKeyword);

    const rawContent = postContent || "";
    const isHtml = /<\s*[a-zA-Z][^>]*>/.test(rawContent);
    let contentHtml = rawContent;

    // Add internal link
    const internalLink =
      "<p>If you are interested in learning more about religion, please visit " +
      '<a href="https://whatreligionisinfo.com/">whatreligionisinfo.com</a>.</p>';
    contentHtml += internalLink;

    const celebrityName = title;

    // Get cookies from the request to pass to image search API
    const cookies = request.headers.get("cookie") || "";

    // Step 2: Find image (use provided image_url if available, otherwise search)
    const providedImageUrl = body.image_url || null;
    const imageUrl =
      providedImageUrl || (await findImage(celebrityName, cookies, request));

    // Step 3: Generate SEO title & description
    const { seoTitle, metaDescription } = await generateSEOContent(
      focusKeyword,
      title,
      postContent
    );

    // Combine meta description and content
    const postContentFinal = metaDescription + "\n\n" + contentHtml;

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
      status: "publish",
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
