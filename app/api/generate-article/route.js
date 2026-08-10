import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cronAuth";

// Helper function to get base URL from request
function getBaseUrl(request) {
  // Try to get from request headers first (for internal calls)
  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || 
                   (request.headers.get("x-forwarded-ssl") === "on" ? "https" : "http");
  
  if (host) {
    return `${protocol}://${host}`;
  }
  
  // Fallback to environment variables
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

// Helper function to create SSE stream
function createSSEStream(stepsCallback) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendStep = (step) => {
        const data = JSON.stringify(step);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      try {
        await stepsCallback(sendStep);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return stream;
}

// POST endpoint to generate article using LangGraph flow
export async function POST(request) {
  try {
    // Check authentication
    if (!(await isAuthorized(request))) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { celebrityName, websiteId } = body;

    if (!celebrityName || !celebrityName.trim()) {
      return NextResponse.json(
        { error: "celebrityName is required" },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl(request);
    const steps = [];
    let finalResult = null;

    // Get cookies from the original request to pass to internal API calls
    const cookies = request.headers.get("cookie") || "";
    // Forward the cron secret too, so this works when called by the daily
    // cron pipeline (no browser session cookie present in that case).
    const cronSecret = request.headers.get("x-cron-secret") || "";

    console.log(`[Generate Article] Using base URL: ${baseUrl} for celebrity: ${celebrityName}`);

    // Check if client wants streaming (SSE)
    const useStreaming = request.headers.get("accept")?.includes("text/event-stream");
    
    // If streaming, we'll need to modify the approach
    // For now, collect steps and return at end, but we can enhance later
    
    try {
      // Step 1: Image Search (Find Image)
      steps.push({ step: "Searching for images...", status: "in_progress" });
      const imageSearchResponse = await fetch(
        `${baseUrl}/api/image-search?q=${encodeURIComponent(celebrityName)}`,
        {
          headers: {
            Cookie: cookies,
            "x-cron-secret": cronSecret,
          },
        }
      );
      
      if (!imageSearchResponse.ok) {
        const errorText = await imageSearchResponse.text();
        throw new Error(`Failed to search images: ${imageSearchResponse.status} ${imageSearchResponse.statusText}. ${errorText.substring(0, 200)}`);
      }
      
      // Check if response is JSON
      const imageContentType = imageSearchResponse.headers.get("content-type") || "";
      if (!imageContentType.includes("application/json")) {
        const errorText = await imageSearchResponse.text();
        throw new Error(`Invalid response from image-search API. Expected JSON but got: ${imageContentType}. Response: ${errorText.substring(0, 200)}`);
      }
      
      const imageData = await imageSearchResponse.json();
      steps.push({ step: "Found images", status: "completed", data: imageData });

      // Step 2: Find Sources
      steps.push({ step: "Finding sources...", status: "in_progress" });
      const findSourcesResponse = await fetch(
        `${baseUrl}/api/find-sources?q=${encodeURIComponent(celebrityName)}`,
        {
          headers: {
            Cookie: cookies,
            "x-cron-secret": cronSecret,
          },
        }
      );
      
      if (!findSourcesResponse.ok) {
        const errorText = await findSourcesResponse.text();
        throw new Error(`Failed to find sources: ${findSourcesResponse.status} ${findSourcesResponse.statusText}. ${errorText.substring(0, 200)}`);
      }
      
      // Check if response is JSON (not HTML error page)
      const contentType = findSourcesResponse.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const errorText = await findSourcesResponse.text();
        throw new Error(`Invalid response from find-sources API. Expected JSON but got: ${contentType}. Response: ${errorText.substring(0, 200)}`);
      }
      
      const sourcesData = await findSourcesResponse.json();
      steps.push({ step: "Found sources", status: "completed", data: sourcesData });

      // Extract URLs from sources
      const urls = [
        sourcesData.wikipedia,
        sourcesData.religionURL,
        sourcesData.religion,
      ].filter(Boolean);

      // Step 3: Fetch Content from all URLs
      if (urls.length > 0) {
        steps.push({ step: "Fetching content from URLs...", status: "in_progress" });
        const fetchContentResponse = await fetch(`${baseUrl}/api/fetch-content`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            Cookie: cookies,
            "x-cron-secret": cronSecret,
          },
          body: JSON.stringify({ urls }),
        });
        
        if (!fetchContentResponse.ok) {
          const errorText = await fetchContentResponse.text();
          throw new Error(`Failed to fetch content: ${fetchContentResponse.status} ${fetchContentResponse.statusText}. ${errorText.substring(0, 200)}`);
        }
        
        // Check if response is JSON
        const fetchContentType = fetchContentResponse.headers.get("content-type") || "";
        if (!fetchContentType.includes("application/json")) {
          const errorText = await fetchContentResponse.text();
          throw new Error(`Invalid response from fetch-content API. Expected JSON but got: ${fetchContentType}. Response: ${errorText.substring(0, 200)}`);
        }
        
        const contentData = await fetchContentResponse.json();
        steps.push({ step: "Fetched content", status: "completed", data: contentData });

        // Combine all content
        const combinedContent = contentData.results
          .filter((r) => r.success && r.content)
          .map((r) => r.content)
          .join("\n\n");

        if (combinedContent) {
          // Step 4: Write Blog
          steps.push({ step: "Generating blog post...", status: "in_progress" });
          let writeBlogUrl = `${baseUrl}/api/write-blog?keyword=${encodeURIComponent(celebrityName)}`;
          if (websiteId) {
            writeBlogUrl += `&website_id=${encodeURIComponent(websiteId)}`;
          }
          const writeBlogResponse = await fetch(writeBlogUrl, {
            method: "POST",
            headers: { 
              "Content-Type": "text/plain",
              Cookie: cookies,
            "x-cron-secret": cronSecret,
            },
            body: combinedContent,
          });
          
          if (!writeBlogResponse.ok) {
            const errorText = await writeBlogResponse.text();
            throw new Error(`Failed to write blog: ${writeBlogResponse.status} ${writeBlogResponse.statusText}. ${errorText.substring(0, 200)}`);
          }
          
          const blogData = await writeBlogResponse.json();
          steps.push({ step: "Blog post generated", status: "completed", data: blogData });

          if (blogData.blog_post && blogData.blog_post.content) {
            // Step 5: Humanize
            steps.push({ step: "Humanizing content...", status: "in_progress" });
            const humanizeResponse = await fetch(`${baseUrl}/api/humanize`, {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                Cookie: cookies,
            "x-cron-secret": cronSecret,
              },
              body: JSON.stringify({
                html: blogData.blog_post.content,
                call_ai: true,
              }),
            });
            
            if (!humanizeResponse.ok) {
              const errorText = await humanizeResponse.text();
              throw new Error(`Failed to humanize content: ${humanizeResponse.status} ${humanizeResponse.statusText}. ${errorText.substring(0, 200)}`);
            }
            
            const humanizedData = await humanizeResponse.json();
            steps.push({
              step: "Content humanized",
              status: "completed",
              data: humanizedData,
            });

            const humanizedContent = humanizedData.humanized_html || blogData.blog_post.content;

            // Step 6: Create WordPress Post
            steps.push({ step: "Creating WordPress post...", status: "in_progress" });
            // Use POST instead of GET to avoid 431 error with large content
            const wpUrl = `${baseUrl}/api/wp-create-post`;
            const wpResponse = await fetch(wpUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: cookies,
            "x-cron-secret": cronSecret,
              },
              body: JSON.stringify({
                post_content: humanizedContent,
                keyword: celebrityName,
                website_id: websiteId || null,
                image_url: imageData.url || null, // Pass the image URL from image search
              }),
            });
            
            if (!wpResponse.ok) {
              const errorText = await wpResponse.text();
              steps.push({
                step: "WordPress post created",
                status: "error",
                error: `Failed to create WordPress post: ${wpResponse.status} ${wpResponse.statusText}. ${errorText.substring(0, 200)}`,
              });
              throw new Error(`Failed to create WordPress post: ${wpResponse.status} ${wpResponse.statusText}. ${errorText.substring(0, 200)}`);
            }
            
            const wpData = await wpResponse.json();
            steps.push({
              step: "WordPress post created",
              status: wpData.status === "success" ? "completed" : "error",
              error: wpData.status !== "success" ? (wpData.error || wpData.message || "Unknown error") : undefined,
              data: wpData,
            });

            // Step 7: Save WordPress post to database
            if (wpData.status === "success" && websiteId) {
              steps.push({ step: "Saving to database...", status: "in_progress" });
              try {
                const saveResponse = await fetch(`${baseUrl}/api/wordpress-posts`, {
                  method: "POST",
                  headers: { 
                    "Content-Type": "application/json",
                    Cookie: cookies,
            "x-cron-secret": cronSecret,
                  },
                  body: JSON.stringify({
                    website_id: parseInt(websiteId),
                    celebrity_name: celebrityName,
                    post_title: wpData.title || blogData.blog_post.title || celebrityName,
                    post_id: wpData.post_id,
                    post_url: wpData.slug ? `https://whatreligionisinfo.com/${wpData.slug}/` : null,
                    image_url: wpData.image_url || imageData.url || null,
                    content: humanizedContent,
                    slug: wpData.slug || null,
                    meta_description: wpData.meta_description || null,
                  }),
                });

                if (saveResponse.ok) {
                  const saveData = await saveResponse.json();
                  steps.push({
                    step: "Saved to database",
                    status: "completed",
                    data: saveData,
                  });
                } else {
                  steps.push({
                    step: "Database save failed",
                    status: "error",
                    error: await saveResponse.text(),
                  });
                }
              } catch (saveError) {
                steps.push({
                  step: "Database save error",
                  status: "error",
                  error: saveError.message,
                });
              }
            }

            finalResult = {
              title: blogData.blog_post.title || celebrityName,
              content: humanizedContent,
              imageUrl: imageData.url || null,
              sources: sourcesData,
              wordpress: wpData,
            };
          }
        }
      }
    } catch (error) {
      console.error("Error in generate-article flow:", error);
      steps.push({
        step: "Error occurred",
        status: "error",
        error: error.message,
      });
    }

    // Return response with steps
    return NextResponse.json({
      success: finalResult !== null,
      celebrityName,
      steps,
      result: finalResult,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error("Error in generate-article API:", error);
    return NextResponse.json(
      {
        error: "Failed to generate article",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

