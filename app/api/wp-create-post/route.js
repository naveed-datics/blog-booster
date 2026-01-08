import { NextResponse } from "next/server";

// WordPress Configuration
const WP_BASE = process.env.WP_BASE_URL || "https://whatreligionisinfo.com/wp-json/wp/v2";
const WP_AUTH_HEADER = process.env.WP_AUTH_HEADER || "Basic YWRtaW46YWRtaW5Ad29yazEyMw==";

// Helper function to slugify text
function slugify(s) {
  s = s.trim().toLowerCase();
  s = s.replace(/[^\w\s-]/g, "");
  s = s.replace(/\s+/g, "-");
  s = s.replace(/-{2,}/g, "-");
  return s.trim("-");
}

// Find image using existing image search API
async function findImage(celebrityName) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(
      `${baseUrl}/api/image-search?q=${encodeURIComponent(celebrityName)}&limit=1`,
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);

    if (response.status === 200) {
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
    let azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

    // Remove quotes if present
    if (azureApiKey) azureApiKey = azureApiKey.replace(/^["']|["']$/g, "");
    if (azureEndpoint) azureEndpoint = azureEndpoint.replace(/^["']|["']$/g, "");
    if (azureDeploymentName) azureDeploymentName = azureDeploymentName.replace(/^["']|["']$/g, "");
    if (azureApiVersion) azureApiVersion = azureApiVersion.replace(/^["']|["']$/g, "");

    const useAzure = azureApiKey && azureEndpoint && azureDeploymentName;

    if (useAzure) {
      const endpoint = azureEndpoint.replace(/\/$/, "");
      const azureUrl = `${endpoint}/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion}`;

      // Generate SEO Title
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
                content: `You are an SEO assistant. Create one SEO title that includes '${focusKeyword}'. Do not add commentary.`,
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
            seoTitle = candidate.trim();
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
      '<p>If you are interested in learning more about religion, please visit ' +
      '<a href="https://whatreligionisinfo.com/">whatreligionisinfo.com</a>.</p>';
    contentHtml += internalLink;

    const celebrityName = title;

    // Step 2: Find image
    const imageUrl = await findImage(celebrityName);

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

    // Step 4: Create post
    const postPayload = {
      title: seoTitle,
      content: postContentFinal,
      status: "draft",
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

    // Step 5: Upload and assign featured image if available
    if (imageUrl) {
      try {
    // Download image
    const imgController = new AbortController();
    const imgTimeoutId = setTimeout(() => imgController.abort(), 10000);
    const imgResponse = await fetch(imageUrl, { signal: imgController.signal });
    clearTimeout(imgTimeoutId);
    
    if (!imgResponse.ok) {
      throw new Error(`Failed to download image: ${imgResponse.statusText}`);
    }

        const imgData = await imgResponse.arrayBuffer();
        const contentType =
          imgResponse.headers.get("Content-Type") || "image/jpeg";
        const extension = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/gif": "gif",
          "image/bmp": "bmp",
        }[contentType] || "jpg";

        const randomNumber = Math.floor(Math.random() * 9000) + 1000;
        const filename = `${title.toLowerCase().replace(/\s+/g, "-")}-${randomNumber}.${extension}`;

        const mediaHeaders = {
          Authorization: WP_AUTH_HEADER,
          "Content-Disposition": `attachment; filename=${filename}`,
          "Content-Type": contentType,
        };

        // Upload image
        const mediaResponse = await fetch(`${WP_BASE}/media`, {
          method: "POST",
          headers: mediaHeaders,
          body: Buffer.from(imgData),
        });

        if (mediaResponse.status === 201) {
          const mediaData = await mediaResponse.json();
          const mediaId = mediaData.id;

          // Set alt text, title, and description
          const patchData = {
            title: focusKeyword,
            alt_text: focusKeyword,
            description: celebrityName,
          };

          await fetch(`${WP_BASE}/media/${mediaId}`, {
            method: "POST",
            headers: headersJson,
            body: JSON.stringify(patchData),
          });

          // Attach featured image to post
          const updateResponse = await fetch(`${WP_BASE}/posts/${postId}`, {
            method: "POST",
            headers: headersJson,
            body: JSON.stringify({ featured_media: mediaId }),
          });

          if (updateResponse.status === 200 || updateResponse.status === 201) {
            // Save to database
            await saveWordPressPostToDatabase({
              website_id: websiteId ? parseInt(websiteId) : null,
              celebrity_name: celebrityName,
              post_title: seoTitle,
              post_id: postId,
              post_url: null, // WordPress post URL can be constructed from slug
              image_url: imageUrl,
              content: postContentFinal,
              slug: slugVal,
              meta_description: metaDescription,
            });

            return NextResponse.json({
              status: "success",
              post_id: postId,
              media_id: mediaId,
              message: `Post ID ${postId} created with featured image ID ${mediaId}`,
              title: seoTitle,
              meta_description: metaDescription,
              image_url: imageUrl,
              slug: slugVal,
            });
          } else {
            const updateErrorText = await updateResponse.text();
            return NextResponse.json({
              status: "partial_success",
              post_id: postId,
              message: `Post created but failed to set featured image: ${updateErrorText}`,
              status_code: updateResponse.status,
            });
          }
        } else {
          const mediaErrorText = await mediaResponse.text();
          return NextResponse.json({
            status: "partial_success",
            post_id: postId,
            message: `Post created but image upload failed: ${mediaErrorText}`,
            status_code: mediaResponse.status,
          });
        }
      } catch (error) {
        console.error("Error uploading image:", error);
        return NextResponse.json({
          status: "partial_success",
          post_id: postId,
          message: `Post created but error uploading image: ${error.message}`,
        });
      }
    }

    return NextResponse.json({
      status: "success",
      post_id: postId,
      post_title: seoTitle,
      slug: slugVal,
      meta_description: metaDescription,
      image_url: imageUrl,
      message: `Post ${postId} created successfully`,
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

// POST endpoint (alternative method)
export async function POST(request) {
  try {
    const body = await request.json();
    const postContent = body.post_content || "";
    const keyword = body.keyword || "";

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

    // Reuse the same logic by creating a new request URL
    const url = new URL(request.url);
    url.searchParams.set("post_content", postContent);
    url.searchParams.set("keyword", keyword);
    if (websiteId) {
      url.searchParams.set("website_id", websiteId);
    }
    
    // Create a new request object with the modified URL
    const newRequest = new Request(url.toString(), {
      method: "GET",
      headers: request.headers,
    });

    return GET(newRequest);
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

