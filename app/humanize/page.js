"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

export default function HumanizePage() {
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [useAI, setUseAI] = useState(false);

  const humanizeContent = async () => {
    if (!inputText.trim()) {
      setError("Please enter some text or HTML to humanize");
      return;
    }

    setLoading(true);
    setError(null);
    setOutputText("");

    try {
      const response = await fetch("/api/humanize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          html: inputText,
          call_ai: useAI,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage =
          errorData.error ||
          errorData.message ||
          `Failed to humanize content: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setOutputText(data.humanized_html || "");
      
      if (data.ai_error) {
        setError(`AI processing failed: ${data.ai_error}. Local humanization applied.`);
      }
    } catch (err) {
      setError(err.message);
      console.error("Error humanizing content:", err);
    } finally {
      setLoading(false);
    }
  };

  const copyOutput = () => {
    if (outputText) {
      navigator.clipboard.writeText(outputText);
      alert("Humanized content copied to clipboard!");
    } else {
      alert("No content available to copy");
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Humanize Text</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Convert business jargon and formal language into simpler, more natural text.
          Supports both plain text and HTML content. HTML tags will be preserved.
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                id="use-ai"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label
                htmlFor="use-ai"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Use AI for additional humanization (requires OpenAI API key)
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="input-text"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Input Text / HTML
              </label>
              <textarea
                id="input-text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={12}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                placeholder="Enter text or HTML content to humanize..."
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={humanizeContent}
                disabled={loading || !inputText.trim()}
                className="px-6 py-2"
              >
                {loading ? "Humanizing..." : "Humanize Text"}
              </Button>
            </div>

            {error && (
              <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg">
                <p className="font-semibold">Error:</p>
                <p>{error}</p>
              </div>
            )}

            {outputText && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Humanized Output
                  </label>
                  <Button
                    onClick={copyOutput}
                    variant="outline"
                    className="px-4 py-2 flex items-center gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                </div>
                <textarea
                  readOnly
                  value={outputText}
                  rows={12}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Output length: {outputText.length.toLocaleString()} characters
                </p>
              </div>
            )}

            {!loading && !outputText && !error && (
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <p className="text-gray-600 dark:text-gray-400 text-center">
                  Enter text or HTML content and click "Humanize Text" to convert
                  business jargon into simpler language.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

