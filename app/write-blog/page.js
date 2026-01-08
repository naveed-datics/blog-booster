"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

function WriteBlogContent() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [keyword, setKeyword] = useState("");
  const [scrapedContent, setScrapedContent] = useState("");
  const [blogPost, setBlogPost] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [websiteId, setWebsiteId] = useState(null);
  const [userWebsites, setUserWebsites] = useState([]);

  // Fetch user websites if logged in
  useEffect(() => {
    if (session?.user) {
      fetch("/api/websites")
        .then((res) => res.json())
        .then((data) => {
          if (data.websites && data.websites.length > 0) {
            setUserWebsites(data.websites);
            // If no website_id in URL but user has websites, use the first one
            const websiteIdParam = searchParams.get("website_id");
            if (!websiteIdParam && data.websites.length > 0) {
              setWebsiteId(data.websites[0].id.toString());
              console.log("Auto-selected first website:", data.websites[0].id);
            }
          }
        })
        .catch((err) => console.error("Error fetching websites:", err));
    }
  }, [session, searchParams]);

  useEffect(() => {
    // Get keyword and website_id from URL params
    const keywordParam = searchParams.get("keyword");
    const websiteIdParam = searchParams.get("website_id");
    
    console.log("Write Blog Page - URL params:", { keywordParam, websiteIdParam });
    
    if (keywordParam) {
      setKeyword(keywordParam.trim()); // Remove leading/trailing spaces
    }
    if (websiteIdParam) {
      setWebsiteId(websiteIdParam);
      console.log("Set websiteId from URL:", websiteIdParam);
    }
  }, [searchParams]);

  const writeBlog = async () => {
    if (!keyword.trim()) {
      setError("Please enter a keyword");
      return;
    }

    if (!scrapedContent.trim()) {
      setError("Please provide scraped content");
      return;
    }

    setLoading(true);
    setError(null);
    setBlogPost(null);

    try {
      // Build URL with keyword and website_id if available
      let apiUrl = `/api/write-blog?keyword=${encodeURIComponent(keyword)}`;
      if (websiteId) {
        apiUrl += `&website_id=${encodeURIComponent(websiteId)}`;
      }
      
      console.log("Calling write-blog API with URL:", apiUrl);
      console.log("Current websiteId state:", websiteId);
      
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
        body: scrapedContent,
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage =
          errorData.message ||
          errorData.error ||
          `Failed to write blog: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setBlogPost(data.blog_post);
    } catch (err) {
      setError(err.message);
      console.error("Error writing blog:", err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Write Blog Post</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Enter a keyword and provide scraped content to generate an SEO-optimized
          blog post using AI.
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="keyword"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Keyword (Celebrity Name)
              </label>
              <input
                id="keyword"
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter celebrity name (e.g., Tom Cruise)"
              />
            </div>

            <div>
              <label
                htmlFor="scraped-content"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Scraped Content
              </label>
              <textarea
                id="scraped-content"
                value={scrapedContent}
                onChange={(e) => setScrapedContent(e.target.value)}
                rows={15}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                placeholder="Paste the scraped content from websites here..."
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Paste the content you fetched from the Fetch Content page here
              </p>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button
              onClick={writeBlog}
              disabled={loading || !keyword.trim() || !scrapedContent.trim()}
              className="px-6 py-2"
            >
              {loading ? "Generating..." : "Write Blog Post"}
            </Button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg">
              <p className="font-semibold">Error:</p>
              <p>{error}</p>
            </div>
          )}
        </div>

        {blogPost && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Generated Blog Post</h2>
              <div className="flex gap-2">
                <Button
                  onClick={() => copyToClipboard(blogPost.content)}
                  variant="outline"
                  className="px-4 py-2"
                >
                  Copy Content
                </Button>
                <Button
                  onClick={() => copyToClipboard(blogPost.title)}
                  variant="outline"
                  className="px-4 py-2"
                >
                  Copy Title
                </Button>
              </div>
            </div>

            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-semibold">Title:</span> {blogPost.title}
              </p>
            </div>

            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: blogPost.content }}
              />
            </div>

            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-semibold">Content Length:</span>{" "}
                {blogPost.content.length.toLocaleString()} characters
              </p>
            </div>
          </div>
        )}

        {!loading && !blogPost && !error && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-gray-600 dark:text-gray-400 text-center">
              Enter a keyword and scraped content, then click "Write Blog Post"
              to generate an SEO-optimized article.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WriteBlogPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-6">Write Blog Post</h1>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <WriteBlogContent />
    </Suspense>
  );
}

