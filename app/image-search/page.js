"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function ImageSearchPage() {
  const [celebrityName, setCelebrityName] = useState("");
  const [imageResult, setImageResult] = useState(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageError, setImageError] = useState(null);

  // Image search function
  const searchImage = async () => {
    if (!celebrityName.trim()) {
      setImageError("Please enter a celebrity name");
      return;
    }

    setLoadingImage(true);
    setImageError(null);
    setImageResult(null);

    try {
      const response = await fetch(
        `/api/image-search?q=${encodeURIComponent(celebrityName)}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        // Use the message field if available, otherwise use error field
        const errorMessage =
          errorData.message ||
          errorData.error ||
          `Failed to search image: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setImageResult(data);
    } catch (err) {
      setImageError(err.message);
      console.error("Error searching image:", err);
    } finally {
      setLoadingImage(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Image Search</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Search for images using celebrity names. The search will automatically
          append "Youtube" to your query.
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
                onKeyPress={(e) => e.key === "Enter" && searchImage()}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter celebrity name (e.g., Tom Cruise)"
              />
            </div>
            <Button
              onClick={searchImage}
              disabled={loadingImage || !celebrityName.trim()}
              className="px-6 py-2"
            >
              {loadingImage ? "Searching..." : "Search Image"}
            </Button>
          </div>

          {imageError && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg">
              <p className="font-semibold">Error:</p>
              <p className="mb-2">{imageError}</p>
              {imageError.includes("credits") && (
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

          {imageResult && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="mb-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <span className="font-semibold">Keyword:</span>{" "}
                  {imageResult.keyword}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-semibold">Image URL:</span>{" "}
                  <a
                    href={imageResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    {imageResult.url}
                  </a>
                </p>
              </div>
              <div className="mt-4 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageResult.url}
                  alt={imageResult.keyword}
                  className="max-w-full h-auto rounded-lg border border-gray-200 dark:border-gray-600"
                  onError={(e) => {
                    e.target.style.display = "none";
                    const errorDiv = document.createElement("div");
                    errorDiv.className = "text-red-500 text-sm";
                    errorDiv.textContent = "Failed to load image";
                    e.target.parentNode.appendChild(errorDiv);
                  }}
                />
              </div>
            </div>
          )}

          {!loadingImage && !imageResult && !imageError && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <p className="text-gray-600 dark:text-gray-400 text-center">
                Enter a celebrity name and click "Search Image" to find images.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

