import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Helper function to get base URL
function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

// POST endpoint to generate article using LangGraph flow
export async function POST(request) {
  try {
    // Check authentication
    const session = await auth();
    if (!session || !session.user) {
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

    const baseUrl = getBaseUrl();
    const steps = [];
    let finalResult = null;

    try {
      // Step 1: Find Sources
      steps.push({ step: "Finding sources...", status: "in_progress" });
      const findSourcesResponse = await fetch(
        `${baseUrl}/api/find-sources?q=${encodeURIComponent(celebrityName)}`
      );
      const sourcesData = await findSourcesResponse.json();
      steps.push({ step: "Found sources", status: "completed", data: sourcesData });

      // Extract URLs from sources
      const urls = [
        sourcesData.wikipedia,
        sourcesData.religionURL,
        sourcesData.religion,
      ].filter(Boolean);

      // Step 2: Image Search
      steps.push({ step: "Searching for images...", status: "in_progress" });
      const imageSearchResponse = await fetch(
        `${baseUrl}/api/image-search?q=${encodeURIComponent(celebrityName)}`
      );
      const imageData = await imageSearchResponse.json();
      steps.push({ step: "Found images", status: "completed", data: imageData });

      // Step 3: Fetch Content from all URLs
      if (urls.length > 0) {
        steps.push({ step: "Fetching content from URLs...", status: "in_progress" });
        const fetchContentResponse = await fetch(`${baseUrl}/api/fetch-content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls }),
        });
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
            headers: { "Content-Type": "text/plain" },
            body: combinedContent,
          });
          const blogData = await writeBlogResponse.json();
          steps.push({ step: "Blog post generated", status: "completed", data: blogData });

          if (blogData.blog_post && blogData.blog_post.content) {
            // Step 5: Humanize
            steps.push({ step: "Humanizing content...", status: "in_progress" });
            const humanizeResponse = await fetch(`${baseUrl}/api/humanize`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                html: blogData.blog_post.content,
                call_ai: true,
              }),
            });
            const humanizedData = await humanizeResponse.json();
            steps.push({
              step: "Content humanized",
              status: "completed",
              data: humanizedData,
            });

            const humanizedContent = humanizedData.humanized_html || blogData.blog_post.content;

            // Step 6: Create WordPress Post
            steps.push({ step: "Creating WordPress post...", status: "in_progress" });
            let wpUrl = `${baseUrl}/api/wp-create-post?post_content=${encodeURIComponent(humanizedContent)}&keyword=${encodeURIComponent(celebrityName)}`;
            if (websiteId) {
              wpUrl += `&website_id=${encodeURIComponent(websiteId)}`;
            }
            const wpResponse = await fetch(wpUrl);
            const wpData = await wpResponse.json();
            steps.push({
              step: "WordPress post created",
              status: wpData.status === "success" ? "completed" : "error",
              data: wpData,
            });

            // Step 7: Save WordPress post to database
            if (wpData.status === "success" && websiteId) {
              steps.push({ step: "Saving to database...", status: "in_progress" });
              try {
                const saveResponse = await fetch(`${baseUrl}/api/wordpress-posts`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
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

    return NextResponse.json({
      success: finalResult !== null,
      celebrityName,
      steps,
      result: finalResult,
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

