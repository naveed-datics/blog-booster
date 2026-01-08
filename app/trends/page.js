"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Copy,
  ExternalLink,
} from "lucide-react";

export default function TrendsPage() {
  const [trends, setTrends] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("religion");

  // Saved trends from database
  const [savedTrends, setSavedTrends] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  // Load saved trends from database
  const fetchSavedTrends = async () => {
    setLoadingSaved(true);
    try {
      const url = searchFilter
        ? `/api/trends?search_query=${encodeURIComponent(searchFilter)}`
        : "/api/trends";
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch saved trends: ${response.statusText}`);
      }

      const data = await response.json();
      setSavedTrends(data.trends || []);
    } catch (err) {
      console.error("Error fetching saved trends:", err);
    } finally {
      setLoadingSaved(false);
    }
  };

  // Load saved trends on component mount and after fetching new trends
  useEffect(() => {
    fetchSavedTrends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLatestTrends = async () => {
    setLoading(true);
    setError(null);
    setTrends([]);
    setResults([]);

    try {
      const response = await fetch(
        `/api/trend-search?q=${encodeURIComponent(query)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch trends: ${response.statusText}`);
      }

      const data = await response.json();
      setTrends(data.trends_result || []);
      setResults(data.results || []);

      // Refresh saved trends after saving new ones
      if (data.saved_to_db) {
        // Show success message
        console.log(
          `✅ Successfully saved ${data.saved_count || 0} trends to database`
        );
        // Wait a bit for DB to commit, then refresh
        setTimeout(() => fetchSavedTrends(), 1500);
      }
    } catch (err) {
      setError(err.message);
      console.error("Error fetching trends:", err);
    } finally {
      setLoading(false);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Action handlers
  const handleViewDetails = (trend) => {
    console.log("View details for:", trend);
    // You can implement a modal or detail view here
    alert(`Viewing details for: ${trend.celebrity_name || trend.trend_text}`);
  };

  const handleEdit = (trend) => {
    console.log("Edit trend:", trend);
    // You can implement edit functionality here
    alert(`Editing: ${trend.celebrity_name || trend.trend_text}`);
  };

  const handleDelete = async (trend) => {
    if (
      confirm(
        `Are you sure you want to delete this trend: ${
          trend.celebrity_name || trend.trend_text
        }?`
      )
    ) {
      try {
        // You can implement delete API call here
        console.log("Deleting trend:", trend.id);
        // await fetch(`/api/trends/${trend.id}`, { method: 'DELETE' });
        // fetchSavedTrends(); // Refresh the list
        alert("Delete functionality will be implemented");
      } catch (error) {
        console.error("Error deleting trend:", error);
      }
    }
  };

  const handleCopyUrl = (trend) => {
    if (trend.url) {
      navigator.clipboard.writeText(trend.url);
      alert("URL copied to clipboard!");
    } else {
      alert("No URL available");
    }
  };

  const handleOpenUrl = (trend) => {
    if (trend.url) {
      window.open(trend.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Trends</h1>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex gap-4 items-end mb-4">
            <div className="flex-1">
              <label
                htmlFor="query"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Search Query
              </label>
              <input
                id="query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter search query (e.g., religion)"
              />
            </div>
            <button
              onClick={fetchLatestTrends}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              {loading ? "Loading..." : "Get Latest Trends"}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg">
              <p className="font-semibold">Error:</p>
              <p>{error}</p>
            </div>
          )}
        </div>

        {trends.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Trending Celebrities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {trends.map((trend, index) => (
                <div
                  key={index}
                  className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <p className="font-medium text-gray-900 dark:text-white">
                    {trend}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-4">Search Results</h2>
            <div className="space-y-4">
              {results.map((result, index) => (
                <div
                  key={index}
                  className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-2">
                    {result.celebrity}
                  </h3>
                  {result.URL ? (
                    <a
                      href={result.URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {result.URL}
                    </a>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 italic">
                      {result.website_result || "No data available"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && trends.length === 0 && results.length === 0 && !error && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-gray-600 dark:text-gray-400 text-center">
              Click &quot;Get Latest Trends&quot; to fetch trending celebrities
              and search results.
            </p>
          </div>
        )}

        {/* Saved Trends from Database - Table View */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Saved Trends from Database</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && fetchSavedTrends()}
                placeholder="Filter by search query..."
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <button
                onClick={fetchSavedTrends}
                disabled={loadingSaved}
                className="px-4 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {loadingSaved ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          {loadingSaved ? (
            <p className="text-gray-600 dark:text-gray-400 text-center py-8">
              Loading saved trends...
            </p>
          ) : savedTrends.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead>Celebrity Name</TableHead>
                    <TableHead>Trend Value</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savedTrends.map((trend) => (
                    <TableRow key={trend.id}>
                      <TableCell className="font-medium">
                        <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                          {trend.search_query}
                        </span>
                      </TableCell>
                      <TableCell>
                        {trend.celebrity_name ? (
                          <span className="font-medium">
                            {trend.celebrity_name}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {trend.trend_value ? (
                          <span className="text-sm">{trend.trend_value}</span>
                        ) : (
                          <span className="text-gray-400 italic">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(trend.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleViewDetails(trend)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(trend)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            {trend.url && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleOpenUrl(trend)}
                                >
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Open URL
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleCopyUrl(trend)}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  Copy URL
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(trend)}
                              className="text-red-600 dark:text-red-400"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-gray-600 dark:text-gray-400 text-center py-8">
              No saved trends found. Fetch new trends to save them to the
              database.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
