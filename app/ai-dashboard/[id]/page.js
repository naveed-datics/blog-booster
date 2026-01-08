"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  RefreshCw,
  ChevronDown,
  FileEdit,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AIDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const websiteId = params.id;

  const [website, setWebsite] = useState(null);
  const [trendingList, setTrendingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fetchingTrends, setFetchingTrends] = useState(false);
  const [loadedDates, setLoadedDates] = useState(new Set());
  const [availableDates, setAvailableDates] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [celebrityUrls, setCelebrityUrls] = useState({}); // Map of celebrity_name -> { url: string, lastmod: string | null }
  const [searchingUrls, setSearchingUrls] = useState(false);
  const [generatingArticle, setGeneratingArticle] = useState(false);
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [generatedArticle, setGeneratedArticle] = useState(null);
  const [generationSteps, setGenerationSteps] = useState([]);
  const [autoMode, setAutoMode] = useState(false);
  const [autoIntervalHours, setAutoIntervalHours] = useState(24);
  const [autoModeActive, setAutoModeActive] = useState(false);
  const [nextAutoRun, setNextAutoRun] = useState(null);
  const [currentAutoStep, setCurrentAutoStep] = useState("");

  // Load auto mode state from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined" && websiteId) {
      const savedAutoMode = localStorage.getItem(`autoMode_${websiteId}`);
      const savedInterval = localStorage.getItem(`autoInterval_${websiteId}`);
      if (savedAutoMode === "true") {
        setAutoMode(true);
      }
      if (savedInterval) {
        setAutoIntervalHours(parseInt(savedInterval) || 24);
      }
    }
  }, [websiteId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    } else if (status === "authenticated" && websiteId) {
      fetchWebsiteData();
    }
  }, [status, websiteId, router]);

  const fetchWebsiteData = async () => {
    try {
      setLoading(true);
      setError("");

      // Fetch website details
      const websiteResponse = await fetch("/api/websites");
      if (!websiteResponse.ok) {
        throw new Error("Failed to fetch website");
      }
      const websiteData = await websiteResponse.json();
      const foundWebsite = websiteData.websites.find(
        (w) => w.id === parseInt(websiteId)
      );

      if (!foundWebsite) {
        throw new Error("Website not found");
      }
      setWebsite(foundWebsite);

      // Fetch statistics
      await fetchTrendingList(foundWebsite);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching website data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrendingList = async (
    website,
    dateFilter = null,
    append = false
  ) => {
    try {
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split("T")[0];
      const dateToFetch = dateFilter || today;

      // Fetch saved trends from database for the specific date
      const response = await fetch(`/api/trends?date=${dateToFetch}`);
      if (response.ok) {
        const data = await response.json();

        // Update available dates
        if (data.availableDates) {
          setAvailableDates(data.availableDates);
        }

        // Filter to ensure only items with celebrity names are shown
        const celebrityTrends = (data.trends || []).filter(
          (trend) => trend.celebrity_name && trend.celebrity_name.trim() !== ""
        );

        if (append) {
          // Append to existing list
          setTrendingList((prev) => [...prev, ...celebrityTrends]);
        } else {
          // Replace list (initial load)
          setTrendingList(celebrityTrends);
        }

        // Mark this date as loaded
        setLoadedDates((prev) => new Set([...prev, dateToFetch]));

        // Search for URLs for new celebrities
        if (celebrityTrends.length > 0) {
          searchCelebrityUrls(celebrityTrends, append);
        }
      } else {
        if (!append) {
          setTrendingList([]);
        }
      }
    } catch (err) {
      console.error("Error fetching trending list:", err);
      if (!append) {
        setTrendingList([]);
      }
    }
  };

  const searchCelebrityUrls = async (trends, append = false) => {
    try {
      setSearchingUrls(true);
      const urlMap = { ...celebrityUrls };

      // Search for URLs for each celebrity (only if not already searched)
      const searchPromises = trends
        .filter(
          (trend) => trend.celebrity_name && !urlMap[trend.celebrity_name]
        )
        .map(async (trend) => {
          try {
            const response = await fetch(
              `/api/search-celebrity-url?celebrity_name=${encodeURIComponent(
                trend.celebrity_name
              )}&website_id=${websiteId}`
            );
            if (response.ok) {
              const data = await response.json();
              if (data.found && data.url) {
                urlMap[trend.celebrity_name] = {
                  url: data.url,
                  lastmod: data.lastmod || null,
                };
              }
            }
          } catch (err) {
            console.error(
              `Error searching URL for ${trend.celebrity_name}:`,
              err
            );
          }
        });

      await Promise.all(searchPromises);
      setCelebrityUrls(urlMap);
    } catch (err) {
      console.error("Error searching celebrity URLs:", err);
    } finally {
      setSearchingUrls(false);
    }
  };

  const loadMoreTrends = async () => {
    if (loadingMore || availableDates.length === 0) return;

    try {
      setLoadingMore(true);

      // Find the next date that hasn't been loaded yet
      const nextDate = availableDates.find((date) => !loadedDates.has(date));

      if (!nextDate) {
        toast.info("No more trends to load");
        return;
      }

      // Fetch trends for the next date
      await fetchTrendingList(website, nextDate, true);

      toast.success(
        `Loaded trends from ${new Date(nextDate).toLocaleDateString()}`
      );
    } catch (err) {
      console.error("Error loading more trends:", err);
      toast.error("Failed to load more trends");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleGenerateArticle = async (celebrityName, silent = false) => {
    if (!silent) {
      setGeneratingArticle(true);
      setGenerationSteps([]);
      setGeneratedArticle(null);
      setArticleDialogOpen(true);
    }

    try {
      const response = await fetch("/api/generate-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          celebrityName,
          websiteId: websiteId,
        }),
      });

      const data = await response.json();

      if (data.success && data.result) {
        if (!silent) {
          setGeneratedArticle(data.result);
          setGenerationSteps(data.steps || []);
          toast.success("Article generated successfully!");
        }
        return { success: true, data: data.result };
      } else {
        if (!silent) {
          toast.error(data.error || "Failed to generate article");
          setGenerationSteps(data.steps || []);
        }
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error("Error generating article:", error);
      if (!silent) {
        toast.error("Error generating article: " + error.message);
      }
      return { success: false, error: error.message };
    } finally {
      if (!silent) {
        setGeneratingArticle(false);
      }
    }
  };

  // Check if WordPress post exists for a celebrity
  const checkPostExists = async (celebrityName) => {
    try {
      const response = await fetch(
        `/api/wordpress-posts?website_id=${websiteId}&celebrity_name=${encodeURIComponent(
          celebrityName
        )}`
      );
      if (response.ok) {
        const data = await response.json();
        return data.exists;
      }
      return false;
    } catch (error) {
      console.error("Error checking post existence:", error);
      return false;
    }
  };

  const handleFetchTrends = async () => {
    if (!website || !website.niche) {
      toast.warning("Please set a niche for this website first.", {
        description: "Go to Edit Website to add a niche.",
      });
      return;
    }

    try {
      setFetchingTrends(true);
      setError("");

      // Call the trend-search API with the website's niche as the search query
      const response = await fetch(
        `/api/trend-search?q=${encodeURIComponent(website.niche)}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch trends");
      }

      const data = await response.json();
      console.log("Trends fetched:", data);

      // Refresh the trending list after fetching (show current date trends)
      await fetchTrendingList(website);

      toast.success(`Successfully fetched ${data.saved_count || 0} trends`, {
        description: `Niche: ${website.niche}`,
      });
    } catch (err) {
      console.error("Error fetching trends:", err);
      setError(err.message || "Failed to fetch trends");
      toast.error("Failed to fetch trends", {
        description: err.message || "An error occurred while fetching trends.",
      });
    } finally {
      setFetchingTrends(false);
    }
  };

  // Auto mode logic
  useEffect(() => {
    if (!autoMode || !websiteId || !website) {
      return;
    }

    let timeoutId = null;
    let isRunning = false;

    const runAutoCycle = async () => {
      if (isRunning) {
        console.log("Auto mode cycle already running, skipping...");
        return;
      }

      isRunning = true;
      setAutoModeActive(true);

      try {
        // Step 1: Immediately fetch trends when auto mode is ON
        setCurrentAutoStep("Fetching trends...");
        await handleFetchTrends();

        // Wait for trends to load - use a polling mechanism
        let attempts = 0;
        let trendsLoaded = false;
        while (attempts < 60 && !trendsLoaded) {
          // Wait up to 2 minutes
          // Check if trends have been loaded
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

          // Re-fetch the trending list to get fresh data
          try {
            const response = await fetch(
              `/api/website-stats/${websiteId}/trending`
            );
            if (response.ok) {
              const data = await response.json();
              if (data.trends && data.trends.length > 0) {
                trendsLoaded = true;
                // Update the trending list state
                setTrendingList(data.trends);
              }
            }
          } catch (err) {
            console.error("Error checking trends:", err);
          }
          attempts++;
        }

        // Get the current trending list
        const currentTrends = [...trendingList];

        // If still no trends, try one more fetch
        if (currentTrends.length === 0) {
          try {
            const response = await fetch(
              `/api/website-stats/${websiteId}/trending`
            );
            if (response.ok) {
              const data = await response.json();
              if (data.trends && data.trends.length > 0) {
                setTrendingList(data.trends);
                currentTrends.push(...data.trends);
              }
            }
          } catch (err) {
            console.error("Error fetching trends:", err);
          }
        }

        if (currentTrends.length === 0) {
          setCurrentAutoStep("No trends found, skipping article generation");
          toast.warning("No trends found for auto mode");
          scheduleNextCycle();
          return;
        }

        // Step 2: Process each celebrity one by one with 10-minute intervals
        setCurrentAutoStep(`Processing ${currentTrends.length} celebrities...`);

        for (let i = 0; i < currentTrends.length; i++) {
          const trend = currentTrends[i];

          if (!trend.celebrity_name) {
            continue;
          }

          // Check if post already exists
          const postExists = await checkPostExists(trend.celebrity_name);
          if (postExists) {
            setCurrentAutoStep(
              `Skipping ${trend.celebrity_name} (post already exists) - ${
                i + 1
              }/${currentTrends.length}`
            );
            continue;
          }

          setCurrentAutoStep(
            `Generating article for ${trend.celebrity_name} (${i + 1}/${
              currentTrends.length
            })...`
          );

          // Generate article (silent mode for auto)
          const result = await handleGenerateArticle(
            trend.celebrity_name,
            true
          );

          if (result.success) {
            toast.success(`Article generated for ${trend.celebrity_name}`);
          } else {
            toast.error(
              `Failed to generate article for ${trend.celebrity_name}`
            );
          }

          // Wait 10 minutes before next article (except for the last one)
          if (i < currentTrends.length - 1) {
            setCurrentAutoStep("Waiting 10 minutes before next article...");
            await new Promise((resolve) => setTimeout(resolve, 10 * 60 * 1000));
          }
        }

        setCurrentAutoStep("Auto cycle completed");
        toast.success("Auto mode cycle completed successfully!");

        // Schedule next cycle
        scheduleNextCycle();
      } catch (error) {
        console.error("Error in auto mode cycle:", error);
        toast.error("Auto mode error: " + error.message);
        setCurrentAutoStep("Auto mode error occurred");
        scheduleNextCycle();
      } finally {
        isRunning = false;
        setAutoModeActive(false);
        setCurrentAutoStep("");
      }
    };

    const scheduleNextCycle = () => {
      // Schedule next cycle based on interval
      const nextRun = new Date();
      nextRun.setHours(nextRun.getHours() + autoIntervalHours);
      setNextAutoRun(nextRun);

      // Set timeout for next cycle
      const hoursInMs = autoIntervalHours * 60 * 60 * 1000;
      timeoutId = setTimeout(() => {
        runAutoCycle();
      }, hoursInMs);
    };

    // Start first cycle immediately when auto mode is turned on
    if (autoMode) {
      runAutoCycle();
    }

    // Cleanup
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [autoMode, autoIntervalHours, websiteId, website]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated" || error) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg p-4">
            <p className="font-semibold">Error:</p>
            <p>{error || "Unauthorized access"}</p>
            <Link href="/dashboard">
              <Button variant="outline" className="mt-4">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard">
            <Button variant="ghost" className="mb-4 flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <h1 className="text-4xl font-bold mb-2">
            AI Dashboard - {website?.website_name || "Website"}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            <a
              href={website?.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {website?.website_url}
            </a>
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Trending List</h2>
            <div className="flex items-center gap-4">
              {/* Auto Mode Toggle */}
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Switch
                    id="auto-mode"
                    checked={autoMode}
                    onCheckedChange={(checked) => {
                      setAutoMode(checked);
                      if (typeof window !== "undefined") {
                        localStorage.setItem(
                          `autoMode_${websiteId}`,
                          checked.toString()
                        );
                      }
                      if (!checked) {
                        setAutoModeActive(false);
                        setNextAutoRun(null);
                        setCurrentAutoStep("");
                      }
                    }}
                  />
                  <Label htmlFor="auto-mode" className="cursor-pointer">
                    Auto Mode
                  </Label>
                </div>
                {autoMode && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="auto-interval" className="text-sm">
                      Every
                    </Label>
                    <Input
                      id="auto-interval"
                      type="number"
                      min="1"
                      value={autoIntervalHours}
                      onChange={(e) => {
                        const hours = parseInt(e.target.value) || 24;
                        setAutoIntervalHours(hours);
                        if (typeof window !== "undefined") {
                          localStorage.setItem(
                            `autoInterval_${websiteId}`,
                            hours.toString()
                          );
                        }
                      }}
                      className="w-20"
                    />
                    <Label htmlFor="auto-interval" className="text-sm">
                      hours
                    </Label>
                  </div>
                )}
                {autoMode && nextAutoRun && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Next: {new Date(nextAutoRun).toLocaleString()}
                  </div>
                )}
                {autoModeActive && currentAutoStep && (
                  <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                    {currentAutoStep}
                  </div>
                )}
              </div>
              <Button
                onClick={handleFetchTrends}
                disabled={fetchingTrends || !website?.niche || autoModeActive}
                className="flex items-center gap-2"
              >
                <RefreshCw
                  className={`h-4 w-4 ${fetchingTrends ? "animate-spin" : ""}`}
                />
                {fetchingTrends ? "Fetching Trends..." : "Fetch Trends"}
              </Button>
            </div>
          </div>
          {!website?.niche && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Please set a niche for this website to fetch trends. Go to{" "}
                <Link
                  href={`/add-website?edit=${websiteId}`}
                  className="underline font-semibold"
                >
                  Edit Website
                </Link>{" "}
                to add a niche.
              </p>
            </div>
          )}
          {website?.niche && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <span className="font-semibold">Niche:</span> {website.niche}
              </p>
            </div>
          )}
          {trendingList.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400 text-center py-8">
              No trending items found.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Celebrity Name</TableHead>
                    <TableHead>Trend Value</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trendingList.map((trend) => (
                    <TableRow key={trend.id}>
                      <TableCell className="font-medium">
                        {trend.celebrity_name ? (
                          <span className="text-base font-bold text-gray-900 dark:text-white">
                            {trend.celebrity_name}
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>{trend.trend_value || "-"}</TableCell>
                      <TableCell>
                        {new Date(trend.created_at).toLocaleDateString(
                          "en-US",
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {trend.celebrity_name ? (
                          <div className="flex justify-end gap-2">
                            {!celebrityUrls[trend.celebrity_name] && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  await handleGenerateArticle(
                                    trend.celebrity_name
                                  );
                                }}
                                disabled={generatingArticle}
                                className="flex items-center gap-2"
                              >
                                <FileEdit className="h-4 w-4" />
                                {generatingArticle
                                  ? "Generating..."
                                  : "Generate Article"}
                              </Button>
                            )}
                            {celebrityUrls[trend.celebrity_name] && (
                              <>
                                {(() => {
                                  const urlData =
                                    celebrityUrls[trend.celebrity_name];
                                  const trendDate = new Date(trend.created_at);
                                  const lastmodDate = urlData.lastmod
                                    ? new Date(urlData.lastmod)
                                    : null;

                                  // Check if lastmod is 7+ days older than trend date
                                  const shouldShowUpdate =
                                    lastmodDate &&
                                    trendDate.getTime() -
                                      lastmodDate.getTime() >=
                                      7 * 24 * 60 * 60 * 1000;

                                  return (
                                    <>
                                      {shouldShowUpdate && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            router.push(
                                              `/write-blog?keyword=${encodeURIComponent(
                                                trend.celebrity_name
                                              )}&website_id=${websiteId}`
                                            );
                                          }}
                                          className="flex items-center gap-2"
                                        >
                                          <FileEdit className="h-4 w-4" />
                                          Update Article
                                        </Button>
                                      )}
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              window.open(
                                                urlData.url,
                                                "_blank"
                                              );
                                            }}
                                            className="flex items-center"
                                          >
                                            <ExternalLink className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div>
                                            <p className="font-semibold">
                                              View Blog Post
                                            </p>
                                            {urlData.lastmod && (
                                              <p className="text-xs text-gray-400 mt-1">
                                                Last updated:{" "}
                                                {new Date(
                                                  urlData.lastmod
                                                ).toLocaleDateString("en-US", {
                                                  year: "numeric",
                                                  month: "long",
                                                  day: "numeric",
                                                })}
                                              </p>
                                            )}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </>
                                  );
                                })()}
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <span className="text-gray-400 text-sm">-</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {trendingList.length > 0 && (
            <div className="mt-4 flex justify-center">
              {availableDates.some((date) => !loadedDates.has(date)) ? (
                <Button
                  onClick={loadMoreTrends}
                  disabled={loadingMore}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  {loadingMore ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Load More (Previous Day)
                    </>
                  )}
                </Button>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  All trends loaded
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Article Generation Dialog */}
      <Dialog open={articleDialogOpen} onOpenChange={setArticleDialogOpen}>
        <DialogContent className="!max-w-[90vw] !w-[90vw] !max-h-[90vh] !h-[90vh] !m-0 !rounded-none !p-6 overflow-y-auto !translate-x-[-50%] !translate-y-[-50%] !top-[50%] !left-[50%]">
          <DialogHeader>
            <DialogTitle>
              Generated Article: {generatedArticle?.title || "Generating..."}
            </DialogTitle>
            <DialogDescription>
              {generatingArticle
                ? "Please wait while we generate your article..."
                : "Your article has been generated successfully!"}
            </DialogDescription>
          </DialogHeader>

          {generationSteps.length > 0 && (
            <div className="mb-4 space-y-2">
              <h3 className="font-semibold text-sm">Generation Steps:</h3>
              {generationSteps.map((step, index) => (
                <div
                  key={index}
                  className={`text-sm p-2 rounded ${
                    step.status === "completed"
                      ? "bg-green-50 text-green-700"
                      : step.status === "in_progress"
                      ? "bg-blue-50 text-blue-700"
                      : step.status === "error"
                      ? "bg-red-50 text-red-700"
                      : "bg-gray-50 text-gray-700"
                  }`}
                >
                  {step.status === "in_progress" && "⏳ "}
                  {step.status === "completed" && "✅ "}
                  {step.status === "error" && "❌ "}
                  {step.step}
                </div>
              ))}
            </div>
          )}

          {generatedArticle && (
            <div className="space-y-4">
              {generatedArticle.imageUrl && (
                <div className="mb-4">
                  <img
                    src={generatedArticle.imageUrl}
                    alt={generatedArticle.title}
                    className="max-w-full h-auto rounded-lg"
                  />
                </div>
              )}
              {generatedArticle.wordpress && (
                <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                    ✅ WordPress Post Created Successfully!
                  </h3>
                  <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                    <p>
                      <strong>Post ID:</strong>{" "}
                      {generatedArticle.wordpress.post_id}
                    </p>
                    {generatedArticle.wordpress.media_id && (
                      <p>
                        <strong>Featured Image ID:</strong>{" "}
                        {generatedArticle.wordpress.media_id}
                      </p>
                    )}
                    {generatedArticle.wordpress.slug && (
                      <p>
                        <strong>Slug:</strong> {generatedArticle.wordpress.slug}
                      </p>
                    )}
                    {generatedArticle.wordpress.title && (
                      <p>
                        <strong>Title:</strong>{" "}
                        {generatedArticle.wordpress.title}
                      </p>
                    )}
                    {generatedArticle.wordpress.meta_description && (
                      <p>
                        <strong>Meta Description:</strong>{" "}
                        {generatedArticle.wordpress.meta_description}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: generatedArticle.content }}
              />
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedArticle.content);
                    toast.success("Content copied to clipboard!");
                  }}
                  variant="outline"
                >
                  Copy Content
                </Button>
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedArticle.title);
                    toast.success("Title copied to clipboard!");
                  }}
                  variant="outline"
                >
                  Copy Title
                </Button>
              </div>
            </div>
          )}

          {generatingArticle && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <span className="ml-2">Generating article...</span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
