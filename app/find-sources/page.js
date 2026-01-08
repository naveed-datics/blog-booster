"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function FindSourcesPage() {
  const [celebrityName, setCelebrityName] = useState("");
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Find sources function
  const findSources = async () => {
    if (!celebrityName.trim()) {
      setError("Please enter a celebrity name");
      return;
    }

    setLoading(true);
    setError(null);
    setSources(null);

    try {
      const response = await fetch(
        `/api/find-sources?q=${encodeURIComponent(celebrityName)}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage =
          errorData.message ||
          errorData.error ||
          `Failed to find sources: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setSources(data);
    } catch (err) {
      setError(err.message);
      console.error("Error finding sources:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Find Sources</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Enter a celebrity name to find relevant sources including Wikipedia and
          religion-related URLs using advanced LSI (Latent Semantic Indexing) word
          matching.
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex gap-4 items-end mb-4">
            <div className="flex-1">
              <label
                htmlFor="celebrity-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Celebrity Name
              </label>
              <input
                id="celebrity-name"
                type="text"
                value={celebrityName}
                onChange={(e) => setCelebrityName(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && findSources()}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter celebrity name (e.g., Tom Cruise)"
              />
            </div>
            <Button
              onClick={findSources}
              disabled={loading || !celebrityName.trim()}
              className="px-6 py-2"
            >
              {loading ? "Searching..." : "Find Sources"}
            </Button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg">
              <p className="font-semibold">Error:</p>
              <p className="mb-2">{error}</p>
              {error.includes("credits") && (
                <p className="text-sm mt-2">
                  💡 <strong>Solution:</strong> Add credits to your SerpAPI
                  account at{" "}
                  <a
                    href="https://serpapi.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-red-800 dark:hover:text-red-300"
                  >
                    serpapi.com
                  </a>
                </p>
              )}
            </div>
          )}

          {sources && (
            <div className="mt-4 space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-3">
                  Wikipedia
                </h3>
                {sources.wikipedia ? (
                  <a
                    href={sources.wikipedia}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    {sources.wikipedia}
                  </a>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">
                    No Wikipedia URL found
                  </p>
                )}
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-3">
                  Religion URL (Title Match)
                </h3>
                {sources.religionURL ? (
                  <a
                    href={sources.religionURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    {sources.religionURL}
                  </a>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">
                    No religion URL found
                  </p>
                )}
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-3">
                  Religion URL (Description Match)
                </h3>
                {sources.religion ? (
                  <a
                    href={sources.religion}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    {sources.religion}
                  </a>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">
                    No religion URL found
                  </p>
                )}
              </div>
            </div>
          )}

          {!loading && !sources && !error && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <p className="text-gray-600 dark:text-gray-400 text-center">
                Enter a celebrity name and click "Find Sources" to search for
                relevant URLs.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
