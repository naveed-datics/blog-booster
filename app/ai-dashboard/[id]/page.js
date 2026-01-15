"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  RefreshCw,
  ChevronDown,
  FileEdit,
  ExternalLink,
  Play,
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
  const [offset, setOffset] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [celebrityUrls, setCelebrityUrls] = useState({}); // Map of celebrity_name -> { url: string, lastmod: string | null }
  const [searchingUrls, setSearchingUrls] = useState(false);
  const [generatingArticle, setGeneratingArticle] = useState(false);
  const [generatedArticle, setGeneratedArticle] = useState(null);
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [generationSteps, setGenerationSteps] = useState([]);
  const [dailyAutoArticleCount, setDailyAutoArticleCount] = useState(0);
  const [lastAutoArticleHour, setLastAutoArticleHour] = useState(null);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [autoModeStartTime, setAutoModeStartTime] = useState(null);
  const [processingItems, setProcessingItems] = useState(new Set()); // Track items currently being processed

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    } else if (status === "authenticated" && websiteId) {
      fetchWebsiteData();
    }
  }, [status, websiteId, router]);

  // Automation Logic: Trigger fetchTrends automatically if time matches
  useEffect(() => {
    if (!website?.auto_mode || !website?.fetching_times) return;

    const interval = setInterval(() => {
      const now = new Date();
      // Pakistan Time (UTC +5)
      const pktTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
      const hours = pktTime.getUTCHours();
      const minutes = pktTime.getUTCMinutes();
      const seconds = pktTime.getUTCSeconds();

      // Trigger only at the start of the minute (seconds === 0)
      if (seconds === 0) {
        // Current time in multiple formats for better matching
        const ampm = hours >= 12 ? "PM" : "AM";
        const h12 = hours % 12 || 12;

        // Formats to check: "10AM", "10:00AM", "10:00 AM", "07:40 PM", "7:40PM"
        const currentHHMM_AMPM = `${h12.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")} ${ampm}`;
        const currentHMM_AMPM = `${h12}:${minutes
          .toString()
          .padStart(2, "0")}${ampm}`;
        const currentH_AMPM = minutes === 0 ? `${h12}${ampm}` : null;
        const currentHH_AMPM =
          minutes === 0 ? `${h12.toString().padStart(2, "0")}${ampm}` : null;

        const scheduledTimes = website.fetching_times
          .split(",")
          .map((t) => t.trim().toUpperCase());

        const isMatch = scheduledTimes.some((time) => {
          // Normalize user input (remove spaces for easier matching)
          const normalizedInput = time.replace(/\s+/g, "");
          return (
            normalizedInput === currentHHMM_AMPM.replace(/\s+/g, "") ||
            normalizedInput === currentHMM_AMPM ||
            (currentH_AMPM && normalizedInput === currentH_AMPM) ||
            (currentHH_AMPM && normalizedInput === currentHH_AMPM)
          );
        });

        if (isMatch && !fetchingTrends) {
          console.log(
            `[Automation] Time Match Found! Triggering fetch for ${currentHHMM_AMPM} PKT`
          );
          handleFetchTrends();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [website, fetchingTrends]);

  // Track when auto-mode becomes active
  useEffect(() => {
    if (website?.auto_mode && !autoModeStartTime) {
      setAutoModeStartTime(Date.now());
      console.log(
        `[Automation] Auto-mode activated, will start processing in 15 minutes`
      );
    } else if (!website?.auto_mode) {
      setAutoModeStartTime(null);
    }
  }, [website?.auto_mode, autoModeStartTime]);

  // Function to start processing queue manually or automatically
  const startProcessingQueue = useCallback(async () => {
    if (processingQueue) {
      console.log("Processing queue already running");
      return;
    }

    try {
      setProcessingQueue(true);
      console.log(
        `[Processing] Starting server-side auto-generation for website ${websiteId}`
      );

      // Get list of items to process and mark them as processing
      const itemsToProcess = trendingList.filter(
        (trend) => trend.celebrity_name && !celebrityUrls[trend.celebrity_name]
      );

      // Mark all items as processing
      const processingNames = new Set(
        itemsToProcess.map((t) => t.celebrity_name)
      );
      setProcessingItems(processingNames);

      // Process all items in queue (set high limit to process all)
      const response = await fetch("/api/auto-generate-articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId: websiteId,
          limit: 100, // Process all items in queue
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[Processing] Server-side generation result:`, data);

        if (data.succeeded > 0) {
          toast.success(`Successfully processed ${data.succeeded} article(s)`);
          // Clear processing items
          setProcessingItems(new Set());
          // Refresh the trending list to show updated URLs and move completed items
          setTimeout(() => {
            fetchWebsiteData();
          }, 5000); // Wait 5 seconds for WordPress post to be created
        } else if (data.processed === 0) {
          toast.info("No items in processing queue");
          setProcessingItems(new Set());
        } else {
          toast.warning(
            `Processed ${data.processed} items, but ${data.failed} failed`
          );
          setProcessingItems(new Set());
        }
      } else {
        const errorText = await response.text();
        console.error(`[Processing] Failed to auto-generate:`, errorText);
        toast.error("Failed to start processing queue");
        setProcessingItems(new Set());
      }
    } catch (error) {
      console.error(`[Processing] Error in processing queue:`, error);
      toast.error("Error starting processing queue: " + error.message);
      setProcessingItems(new Set());
    } finally {
      setProcessingQueue(false);
    }
  }, [websiteId, processingQueue, trendingList, celebrityUrls]);

  // Article Automation Logic: Server-side auto-generation
  useEffect(() => {
    if (!website?.auto_mode || fetchingTrends || generatingArticle) return;

    const interval = setInterval(async () => {
      const now = new Date();
      // Pakistan Time (UTC +5)
      const pktTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
      const hours = pktTime.getUTCHours();
      const minutes = pktTime.getUTCMinutes();
      const day = pktTime.getUTCDate();

      // Reset daily count if day changed
      const lastDay = localStorage.getItem(`auto_day_${websiteId}`);
      if (lastDay && parseInt(lastDay) !== day) {
        setDailyAutoArticleCount(0);
        localStorage.setItem(`auto_day_${websiteId}`, day.toString());
      } else if (!lastDay) {
        localStorage.setItem(`auto_day_${websiteId}`, day.toString());
      }

      // Check if 15 minutes have passed since auto-mode activation
      if (autoModeStartTime) {
        const timeSinceActivation =
          (Date.now() - autoModeStartTime) / 1000 / 60; // minutes
        if (timeSinceActivation >= 15 && timeSinceActivation < 16) {
          // Trigger once after 15 minutes
          if (dailyAutoArticleCount < 3 && !processingQueue) {
            console.log(
              `[Automation] 15 minutes passed, starting processing queue`
            );
            setAutoModeStartTime(null); // Reset to prevent multiple triggers
            startProcessingQueue();
            setDailyAutoArticleCount((prev) => prev + 1);
            return;
          }
        }
      }

      // Check if we should trigger (at the start of the hour, once per hour)
      if (minutes === 0 && lastAutoArticleHour !== hours) {
        // Daily limit: 3
        if (dailyAutoArticleCount < 3 && !processingQueue) {
          setLastAutoArticleHour(hours);
          setDailyAutoArticleCount((prev) => prev + 1);
          startProcessingQueue();
        }
      }
    }, 1000 * 60); // Check every minute

    return () => clearInterval(interval);
  }, [
    website,
    websiteId,
    fetchingTrends,
    generatingArticle,
    dailyAutoArticleCount,
    lastAutoArticleHour,
    processingQueue,
    autoModeStartTime,
    startProcessingQueue,
  ]);

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

      // Set loading state before fetching trends
      setSearchingUrls(true);
      setTrendingList([]);

      // Fetch statistics
      await fetchTrendingList(foundWebsite);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching website data:", err);
      // Clear loading state on error
      setSearchingUrls(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrendingList = async (
    website,
    currentOffset = 0,
    append = false
  ) => {
    try {
      // Set loading state for sitemap processing (only for initial load)
      if (!append) {
        setSearchingUrls(true);
        // Clear existing trends to show loading state
        setTrendingList([]);
        setOffset(0);
      }

      // Fetch saved trends from database using the same pattern as /trends page:
      // use the website niche as search_query so results match what /trends shows.
      const searchQueryParam = website?.niche
        ? `search_query=${encodeURIComponent(website.niche)}`
        : "";
      const websiteIdParam = websiteId ? `&website_id=${websiteId}` : "";

      // Use 50 records limit by default
      const apiUrl = `/api/trends?${searchQueryParam}${websiteIdParam}&limit=50&offset=${currentOffset}`;
      console.log("Fetching trends from:", apiUrl);

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        console.log("Trends API response:", {
          trendsCount: data.trends?.length || 0,
          total: data.total,
          limit: data.limit,
          offset: data.offset,
        });

        // Update total records count
        if (data.total !== undefined) {
          setTotalRecords(data.total);
        }

        // Filter to ensure only items with celebrity names are shown
        const filteredTrends = (data.trends || []).filter(
          (trend) => trend.celebrity_name && trend.celebrity_name.trim() !== ""
        );

        // Search for URLs for new celebrities BEFORE displaying trends
        if (filteredTrends.length > 0) {
          await searchCelebrityUrls(filteredTrends, append);

          // Only set trends list AFTER sitemap search is complete
          if (append) {
            // Append to existing list and DEDUPLICATE by celebrity_name to prevent duplicates
            setTrendingList((prev) => {
              const combined = [...prev, ...filteredTrends];
              const seen = new Set();
              return combined.filter((item) => {
                const key = item.celebrity_name || item.id;
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
              });
            });
          } else {
            // Replace list (initial load) - also deduplicate just in case
            const seen = new Set();
            const uniqueTrends = filteredTrends.filter((item) => {
              const key = item.celebrity_name || item.id;
              if (!key || seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            setTrendingList(uniqueTrends);
          }
        } else {
          // No trends found, set empty list if not appending
          if (!append) {
            setTrendingList([]);
          }
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
    } finally {
      // Clear loading state after sitemap processing (only for initial load)
      if (!append) {
        setSearchingUrls(false);
      }
    }
  };

  const searchCelebrityUrls = async (trends, append = false) => {
    try {
      // Only set searchingUrls if this is the initial load (not append)
      if (!append) {
        setSearchingUrls(true);
      }
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
      // Only clear searchingUrls if this is an append operation (called independently)
      // If called from fetchTrendingList, the loading state is managed there
      if (append) {
        setSearchingUrls(false);
      }
    }
  };

  const loadMoreTrends = async () => {
    if (loadingMore || trendingList.length >= totalRecords) return;

    try {
      setLoadingMore(true);
      const nextOffset = offset + 50;
      setOffset(nextOffset);

      // Fetch next 50 trends
      await fetchTrendingList(website, nextOffset, true);
    } catch (err) {
      console.error("Error loading more trends:", err);
      toast.error("Failed to load more trends");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleGenerateArticle = async (celebrityName, silent = false) => {
    setGeneratingArticle(true);
    if (!silent) {
      setGeneratedArticle(null);
      setArticleDialogOpen(true);

      // Initialize all expected steps upfront - all start as pending (will show loading)
      const initialSteps = [
        { step: "Found sources", status: "pending" },
        { step: "Found images", status: "pending" },
        { step: "Fetched content", status: "pending" },
        { step: "Blog post generated", status: "pending" },
        { step: "Content humanized", status: "pending" },
        { step: "WordPress post created", status: "pending" },
        { step: "Saved to database", status: "pending" },
      ];
      setGenerationSteps(initialSteps);
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Update steps as they come in - process sequentially to show updates one by one
      if (data.steps && data.steps.length > 0 && !silent) {
        // Map API step names to our display step names
        const stepMapping = {
          "Finding sources...": "Found sources",
          "Found sources": "Found sources",
          "Searching for images...": "Found images",
          "Found images": "Found images",
          "Fetching content from URLs...": "Fetched content",
          "Fetched content": "Fetched content",
          "Generating blog post...": "Blog post generated",
          "Blog post generated": "Blog post generated",
          "Humanizing content...": "Content humanized",
          "Content humanized": "Content humanized",
          "Creating WordPress post...": "WordPress post created",
          "WordPress post created": "WordPress post created",
          "Saving to database...": "Saved to database",
          "Saved to database": "Saved to database",
        };

        // Process steps sequentially with delays to show updates one by one
        let currentIndex = 0;

        const processNextStep = () => {
          if (currentIndex < data.steps.length) {
            const apiStep = data.steps[currentIndex];
            const targetStepName = stepMapping[apiStep.step];

            if (targetStepName) {
              setGenerationSteps((prevSteps) => {
                const updatedSteps = [...prevSteps];
                const stepIndex = updatedSteps.findIndex(
                  (s) => s.step === targetStepName
                );

                if (stepIndex !== -1) {
                  // Update existing step
                  if (apiStep.status === "error") {
                    // Immediately mark as error (red) - no delay
                    updatedSteps[stepIndex] = {
                      step: targetStepName,
                      status: "error",
                      error:
                        apiStep.error || apiStep.message || "An error occurred",
                    };
                  } else if (apiStep.status === "completed") {
                    // First mark as in_progress, then completed after a brief delay
                    updatedSteps[stepIndex] = {
                      step: targetStepName,
                      status: "in_progress",
                      error: apiStep.error,
                    };

                    // Mark as completed after a short delay
                    setTimeout(() => {
                      setGenerationSteps((prev) => {
                        const newSteps = [...prev];
                        const idx = newSteps.findIndex(
                          (s) => s.step === targetStepName
                        );
                        if (idx !== -1) {
                          newSteps[idx] = {
                            step: targetStepName,
                            status: "completed",
                            error: apiStep.error,
                          };
                        }
                        return newSteps;
                      });
                    }, 500);
                  } else {
                    // Update with current status (in_progress or pending)
                    updatedSteps[stepIndex] = {
                      step: targetStepName,
                      status:
                        apiStep.status === "in_progress"
                          ? "in_progress"
                          : "pending",
                      error: apiStep.error,
                    };
                  }
                } else {
                  // Add new step if not in initial list
                  updatedSteps.push({
                    step: targetStepName,
                    status:
                      apiStep.status === "completed"
                        ? "completed"
                        : apiStep.status === "in_progress"
                        ? "in_progress"
                        : apiStep.status === "error"
                        ? "error"
                        : "pending",
                    error: apiStep.error,
                  });
                }

                return updatedSteps;
              });
            }

            currentIndex++;
            // Process next step after a short delay (400ms) to show progression
            if (currentIndex < data.steps.length) {
              setTimeout(processNextStep, 400);
            }
          }
        };

        // Start processing steps
        processNextStep();
      }

      if (data.success && data.result) {
        if (!silent) {
          setGeneratedArticle(data.result);
          toast.success("Article generated successfully!");
        }

        // Refresh website data to update celebrityUrls and move item to "Complete" tab
        await fetchWebsiteData();

        return { success: true, data: data.result };
      } else {
        if (!silent) {
          toast.error(data.error || "Failed to generate article");
        }
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error("Error generating article:", error);
      if (!silent) {
        setGenerationSteps((prev) => [
          ...prev,
          { step: "Error occurred", status: "error", error: error.message },
        ]);
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

      // Call the trend-search API with the website's niche as the search query and website_id
      const response = await fetch(
        `/api/trend-search?q=${encodeURIComponent(
          website.niche
        )}&website_id=${websiteId}`
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
          {website?.auto_mode && (
            <div className="mt-2 flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider">
                Auto Mode Active: {website.fetching_times} (PKT)
              </span>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">Trending List</h2>
              {searchingUrls && trendingList.length === 0 && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mt-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm">
                    Processing sitemap and loading trends...
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <Button
                onClick={startProcessingQueue}
                disabled={
                  processingQueue ||
                  !website?.niche ||
                  trendingList.length === 0
                }
                variant="default"
                className="flex items-center gap-2"
              >
                <Play
                  className={`h-4 w-4 ${
                    processingQueue ? "animate-pulse" : ""
                  }`}
                />
                {processingQueue ? "Processing..." : "Start Processing"}
              </Button>
              <Button
                onClick={handleFetchTrends}
                disabled={fetchingTrends || !website?.niche}
                className="flex items-center gap-2"
              >
                <RefreshCw
                  className={`h-4 w-4 ${fetchingTrends ? "animate-spin" : ""}`}
                />
                {fetchingTrends ? "Fetching Trends..." : "Fetch Trends"}
              </Button>
            </div>
          </div>

          <Tabs defaultValue="processing" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="processing">Processing</TabsTrigger>
              <TabsTrigger value="update">Update</TabsTrigger>
              <TabsTrigger value="complete">Complete</TabsTrigger>
            </TabsList>

            <TabsContent value="processing">
              {!website?.niche && (
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    ⚠️ Please set a niche for this website to fetch trends. Go
                    to{" "}
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

              {/* Processing Table */}
              {(() => {
                const processingTrends = trendingList.filter(
                  (trend) =>
                    trend.celebrity_name && !celebrityUrls[trend.celebrity_name]
                );

                if (processingTrends.length === 0 && !searchingUrls) {
                  return (
                    <p className="text-gray-600 dark:text-gray-400 text-center py-8">
                      No items in processing queue.
                    </p>
                  );
                }

                if (searchingUrls && processingTrends.length === 0) return null;

                return (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Keyword</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {processingTrends.map((trend) => {
                          const isProcessing =
                            processingItems.has(trend.celebrity_name) ||
                            processingQueue;
                          return (
                            <TableRow key={trend.id}>
                              <TableCell className="font-medium">
                                <span className="text-base font-bold text-gray-900 dark:text-white">
                                  {trend.celebrity_name}
                                </span>
                              </TableCell>
                              <TableCell>
                                {isProcessing ? (
                                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded flex items-center gap-1">
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                    Processing
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded">
                                    Pending
                                  </span>
                                )}
                              </TableCell>
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
                                <div className="flex justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleGenerateArticle(
                                        trend.celebrity_name
                                      )
                                    }
                                    disabled={generatingArticle || isProcessing}
                                    className="flex items-center gap-2"
                                  >
                                    <FileEdit className="h-4 w-4" />
                                    {generatingArticle || isProcessing
                                      ? "Generating..."
                                      : "Generate Article"}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="update">
              {/* Update Table */}
              {(() => {
                const updateTrends = trendingList.filter((trend) => {
                  if (
                    !trend.celebrity_name ||
                    !celebrityUrls[trend.celebrity_name]
                  )
                    return false;

                  const urlData = celebrityUrls[trend.celebrity_name];
                  const trendDate = new Date(trend.created_at);
                  const lastmodDate = urlData.lastmod
                    ? new Date(urlData.lastmod)
                    : null;

                  // Check if lastmod is 7+ days older than trend date
                  return (
                    lastmodDate &&
                    trendDate.getTime() - lastmodDate.getTime() >=
                      7 * 24 * 60 * 60 * 1000
                  );
                });

                if (updateTrends.length === 0) {
                  return (
                    <p className="text-gray-600 dark:text-gray-400 text-center py-8">
                      No articles require updates at this time.
                    </p>
                  );
                }

                return (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Keyword</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {updateTrends.map((trend) => (
                          <TableRow key={trend.id}>
                            <TableCell className="font-medium">
                              <span className="text-base font-bold text-gray-900 dark:text-white">
                                {trend.celebrity_name}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded">
                                Needs Update
                              </span>
                            </TableCell>
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
                              <div className="flex justify-end">
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
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="complete">
              {/* Complete Table */}
              {(() => {
                const completeTrends = trendingList.filter((trend) => {
                  // Item is complete if it has a URL (celebrityUrls entry)
                  if (
                    !trend.celebrity_name ||
                    !celebrityUrls[trend.celebrity_name]
                  )
                    return false;

                  const urlData = celebrityUrls[trend.celebrity_name];
                  const trendDate = new Date(trend.created_at);
                  const lastmodDate = urlData.lastmod
                    ? new Date(urlData.lastmod)
                    : null;

                  // Check if lastmod is LESS than 7 days older than trend date
                  // If it's 7+ days older, it needs update (show in Update tab instead)
                  const needsUpdate =
                    lastmodDate &&
                    trendDate.getTime() - lastmodDate.getTime() >=
                      7 * 24 * 60 * 60 * 1000;

                  // Show in Complete tab if it has URL and doesn't need update
                  return !needsUpdate;
                });

                if (completeTrends.length === 0) {
                  return (
                    <p className="text-gray-600 dark:text-gray-400 text-center py-8">
                      No completed articles yet.
                    </p>
                  );
                }

                return (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Keyword</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">
                            Wordpress URL
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {completeTrends.map((trend) => (
                          <TableRow key={trend.id}>
                            <TableCell className="font-medium">
                              <span className="text-base font-bold text-gray-900 dark:text-white">
                                {trend.celebrity_name}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded">
                                Completed
                              </span>
                            </TableCell>
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
                              <div className="flex justify-end">
                                <a
                                  href={celebrityUrls[trend.celebrity_name].url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 text-blue-600 hover:underline text-sm"
                                >
                                  View Post
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </TabsContent>
          </Tabs>
          {trendingList.length > 25 && (
            <div className="mt-4 flex justify-end">
              {trendingList.length < totalRecords ? (
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
                      Load More
                    </>
                  )}
                </Button>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Showing {trendingList.length} of {totalRecords} trends
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

          {/* Show steps prominently during generation */}
          <div className="mb-6">
            <h3 className="font-semibold text-lg mb-4">
              {generatingArticle ? "Generation Progress:" : "Generation Steps:"}
            </h3>
            {generationSteps.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {generationSteps.map((step, index) => {
                  // Format step names to be more user-friendly
                  const formatStepName = (stepName) => {
                    const stepMap = {
                      "Found sources": "Resources Found",
                      "Found images": "Image Searched",
                      "Fetched content": "Content Retrieved",
                      "Blog post generated": "Article Created",
                      "Content humanized": "Content Humanized",
                      "WordPress post created": "Publishing",
                      "Saved to database": "Saved to Database",
                      "Database save failed": "Database Save Failed",
                      "Database save error": "Database Error",
                      "Error occurred": "Error Occurred",
                    };
                    return stepMap[stepName] || stepName;
                  };

                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                        step.status === "completed"
                          ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200"
                          : step.status === "in_progress"
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200"
                          : step.status === "error"
                          ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200"
                          : step.status === "pending"
                          ? "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                          : "bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <div className="flex-shrink-0">
                        {step.status === "in_progress" && (
                          <RefreshCw className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
                        )}
                        {step.status === "completed" && (
                          <span className="text-xl">✅</span>
                        )}
                        {step.status === "error" && (
                          <span className="text-xl">❌</span>
                        )}
                        {step.status === "pending" && (
                          <RefreshCw className="h-5 w-5 animate-spin text-gray-500 dark:text-gray-400" />
                        )}
                        {!step.status &&
                          step.status !== "in_progress" &&
                          step.status !== "completed" &&
                          step.status !== "error" &&
                          step.status !== "pending" && (
                            <span className="text-xl">⏸️</span>
                          )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">
                          {formatStepName(step.step)}
                        </p>
                        {step.error && (
                          <p className="text-xs mt-1 opacity-75 text-red-600 dark:text-red-400">
                            {step.error}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : generatingArticle ? (
              <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
                <span className="text-blue-800 dark:text-blue-200">
                  Starting article generation...
                </span>
              </div>
            ) : null}
          </div>

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

          {generatingArticle && generationSteps.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600 dark:text-gray-400">
                Initializing article generation...
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
