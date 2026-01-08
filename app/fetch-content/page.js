"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

export default function FetchContentPage() {
  const [urls, setUrls] = useState(["", "", ""]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleUrlChange = (index, value) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const addUrlField = () => {
    if (urls.length < 3) {
      setUrls([...urls, ""]);
    }
  };

  const removeUrlField = (index) => {
    if (urls.length > 1) {
      const newUrls = urls.filter((_, i) => i !== index);
      setUrls(newUrls);
    }
  };

  const fetchContent = async () => {
    const validUrls = urls.filter(url => url.trim() !== "");
    
    if (validUrls.length === 0) {
      setError("Please enter at least one URL");
      return;
    }

    if (validUrls.length > 3) {
      setError("Maximum 3 URLs allowed");
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch("/api/fetch-content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ urls: validUrls }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage =
          errorData.message ||
          errorData.error ||
          `Failed to fetch content: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching content:", err);
    } finally {
      setLoading(false);
    }
  };

  // Combine all successful results' content
  const getCombinedContent = () => {
    if (!results || !results.results) return "";
    
    const successfulResults = results.results.filter(r => r.success && r.content);
    return successfulResults.map((result, index) => {
      return `=== URL ${index + 1}: ${result.url} ===\n\n${result.content}\n\n`;
    }).join("\n");
  };

  const copyCombinedContent = () => {
    const combinedText = getCombinedContent();
    if (combinedText) {
      navigator.clipboard.writeText(combinedText);
      alert("Combined content copied to clipboard!");
    } else {
      alert("No content available to copy");
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Fetch Website Content</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Enter up to 3 URLs to fetch and extract their website content. The
          content will be cleaned and returned as text.
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="space-y-4 mb-4">
            {urls.map((url, index) => (
              <div key={index} className="flex gap-2 items-center">
                <div className="flex-1">
                  <label
                    htmlFor={`url-${index}`}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    URL {index + 1}
                  </label>
                  <input
                    id={`url-${index}`}
                    type="text"
                    value={url}
                    onChange={(e) => handleUrlChange(index, e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && fetchContent()}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="https://example.com"
                  />
                </div>
                {urls.length > 1 && (
                  <button
                    onClick={() => removeUrlField(index)}
                    className="mt-6 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    type="button"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {urls.length < 3 && (
            <button
              onClick={addUrlField}
              className="mb-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              type="button"
            >
              + Add another URL
            </button>
          )}

          <div className="flex justify-end">
            <Button
              onClick={fetchContent}
              disabled={loading || urls.filter(url => url.trim() !== "").length === 0}
              className="px-6 py-2"
            >
              {loading ? "Fetching..." : "Fetch Content"}
            </Button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg">
              <p className="font-semibold">Error:</p>
              <p>{error}</p>
            </div>
          )}

          {results && (
            <div className="mt-6 space-y-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">Total URLs:</span> {results.totalUrls} |{" "}
                  <span className="font-semibold">Successful:</span>{" "}
                  <span className="text-green-600 dark:text-green-400">
                    {results.successCount}
                  </span>{" "}
                  | <span className="font-semibold">Failed:</span>{" "}
                  <span className="text-red-600 dark:text-red-400">
                    {results.failureCount}
                  </span>
                </p>
              </div>

              {/* Combined Content Box */}
              {results.successCount > 0 && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                      Combined Content (All URLs)
                    </h3>
                    <Button
                      onClick={copyCombinedContent}
                      variant="outline"
                      className="px-4 py-2 flex items-center gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      Copy All
                    </Button>
                  </div>
                  <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 max-h-96 overflow-y-auto">
                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                      {getCombinedContent()}
                    </pre>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Total combined length: {getCombinedContent().length.toLocaleString()} characters
                  </p>
                </div>
              )}

              {results.results.map((result, index) => (
                <div
                  key={index}
                  className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <div className="mb-3">
                    <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-2">
                      {result.success ? (
                        <span className="text-green-600 dark:text-green-400">
                          ✓ {result.url}
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">
                          ✗ {result.url}
                        </span>
                      )}
                    </h3>
                    {result.success && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                        <p>
                          <span className="font-semibold">Content Type:</span>{" "}
                          {result.contentType || "Unknown"}
                        </p>
                        <p>
                          <span className="font-semibold">Content Length:</span>{" "}
                          {result.contentLength.toLocaleString()} characters
                          {result.truncated && (
                            <span className="text-yellow-600 dark:text-yellow-400 ml-2">
                              (Truncated)
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    {!result.success && (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        Error: {result.error}
                      </p>
                    )}
                  </div>

                  {result.success && result.content && (
                    <div className="mt-4">
                      <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">
                        Extracted Content:
                      </h4>
                      <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 max-h-96 overflow-y-auto">
                        <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                          {result.content}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && !results && !error && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <p className="text-gray-600 dark:text-gray-400 text-center">
                Enter one or more URLs and click "Fetch Content" to retrieve
                website content.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

