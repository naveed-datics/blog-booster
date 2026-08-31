"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Trash2,
  Square,
  CheckSquare,
  Search,
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
  DialogFooter,
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
  const [processingQueue, setProcessingQueue] = useState(false);
  const [processingItems, setProcessingItems] = useState(new Set()); // Track items currently being processed
  const [selectedItems, setSelectedItems] = useState(new Set()); // Track selected items for processing
  const [createArticleDialogOpen, setCreateArticleDialogOpen] = useState(false);
  const [createArticleKeyword, setCreateArticleKeyword] = useState("");
  const [createArticleStep, setCreateArticleStep] = useState("input"); // "input" | "confirm"
  const [pendingCreateArticle, setPendingCreateArticle] = useState(null); // { keyword, url }
  const [createArticleSearching, setCreateArticleSearching] = useState(false);
  const [createArticleDeleting, setCreateArticleDeleting] = useState(false);
  const [cronLogs, setCronLogs] = useState([]);
  const [cronLogsLoading, setCronLogsLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState(null);

  // Ref to hold handleGenerateArticle to avoid circular dependency
  const handleGenerateArticleRef = useRef(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    } else if (status === "authenticated" && websiteId) {
      fetchWebsiteData();
    }
  }, [status, websiteId, router]);

  const fetchCronLogs = useCallback(async () => {
    if (!websiteId) return;
    setCronLogsLoading(true);
    try {
      const res = await fetch(`/api/cron-logs?website_id=${websiteId}&limit=30`);
      const data = await res.json();
      if (res.ok) {
        setCronLogs(data.logs || []);
      } else {
        toast.error(data.error || "Failed to load cron logs");
      }
    } catch (err) {
      toast.error("Failed to load cron logs");
    } finally {
      setCronLogsLoading(false);
    }
  }, [websiteId]);

  useEffect(() => {
    if (status === "authenticated" && websiteId) {
      fetchCronLogs();
    }
  }, [status, websiteId, fetchCronLogs]);

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

  // Function to start processing selected items one by one
  const startProcessingQueue = useCallback(async () => {
    if (processingQueue) {
      console.log("Processing queue already running");
      return;
    }

    if (selectedItems.size === 0) {
      toast.warning("Please select at least one keyword to process");
      return;
    }

    try {
      setProcessingQueue(true);
      console.log(
        `[Processing] Starting processing for ${selectedItems.size} selected items`
      );

      // Get list of selected items to process
      const itemsToProcess = trendingList.filter(
        (trend) => 
          selectedItems.has(trend.id) && 
          trend.celebrity_name && 
          !celebrityUrls[trend.celebrity_name]
      );

      if (itemsToProcess.length === 0) {
        toast.info("No valid items to process");
        setProcessingQueue(false);
        return;
      }

      // Process items one by one
      let succeeded = 0;
      let failed = 0;
      let skipped = 0;

      for (const trend of itemsToProcess) {
        // Mark current item as processing
        setProcessingItems(new Set([trend.celebrity_name]));

        try {
          console.log(`[Processing] Generating article for: ${trend.celebrity_name}`);

          const result = await handleGenerateArticleRef.current(trend.celebrity_name, true);

          if (result.success) {
            succeeded++;
            // Remove from selected items after successful processing
            setSelectedItems(prev => {
              const newSet = new Set(prev);
              newSet.delete(trend.id);
              return newSet;
            });
          } else if (result.skipped) {
            // Not a failure - the pipeline correctly declined to publish
            // because no confident, sourced public religion answer was
            // found. Still remove it from the selection since it's handled
            // (trend-search already marks it skip_reason so it won't
            // re-queue).
            skipped++;
            setSelectedItems(prev => {
              const newSet = new Set(prev);
              newSet.delete(trend.id);
              return newSet;
            });
          } else {
            failed++;
            console.error(`[Processing] Failed for ${trend.celebrity_name}:`, result.error);
          }
        } catch (error) {
          failed++;
          console.error(`[Processing] Error processing ${trend.celebrity_name}:`, error);
        }

        // Small delay between items to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Clear processing items
      setProcessingItems(new Set());

      // Show result summary
      const parts = [];
      if (succeeded > 0) parts.push(`${succeeded} published`);
      if (skipped > 0) parts.push(`${skipped} skipped (no public answer found)`);
      if (failed > 0) parts.push(`${failed} failed`);

      if (failed > 0) {
        toast.warning(parts.join(", ") || "No items processed");
      } else if (succeeded > 0 || skipped > 0) {
        toast.success(parts.join(", "));
      }

      // Refresh the trending list
      setTimeout(() => {
        fetchWebsiteData();
      }, 2000);

    } catch (error) {
      console.error(`[Processing] Error in processing queue:`, error);
      toast.error("Error starting processing queue: " + error.message);
      setProcessingItems(new Set());
    } finally {
      setProcessingQueue(false);
    }
  }, [websiteId, processingQueue, trendingList, celebrityUrls, selectedItems]);

  // Toggle selection for a single item
  const toggleItemSelection = (trendId) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(trendId)) {
        newSet.delete(trendId);
      } else {
        newSet.add(trendId);
      }
      return newSet;
    });
  };

  // Toggle select all items in processing queue
  const toggleSelectAll = (processingTrends) => {
    const allIds = processingTrends.map(t => t.id);
    const allSelected = allIds.every(id => selectedItems.has(id));
    
    if (allSelected) {
      // Deselect all
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        allIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // Select all
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        allIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  };

  // Delete a single trend (keyword) from the Processing queue
  const handleDeleteTrend = async (trendId) => {
    try {
      const response = await fetch(`/api/trends/${trendId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete trend");
      }

      // Remove deleted trend from local state
      setTrendingList((prev) => prev.filter((trend) => trend.id !== trendId));
      toast.success("Keyword removed from processing queue");
    } catch (error) {
      console.error("Error deleting trend:", error);
      toast.error(error.message || "Failed to delete keyword");
    }
  };

  // NOTE: Article auto-generation is now MANUAL ONLY via the \"Start Processing\" button.
  // Auto mode still controls when trends are fetched (above), but it no longer
  // triggers automatic article generation. This keeps generation fully under
  // user control from the Processing tab.

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
        { step: "Answer extracted", status: "pending" },
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
          "Extracting sourced answer...": "Answer extracted",
          "Answer extracted": "Answer extracted",
          "Skipped: no public answer found": "Answer extracted",
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
            } else if (!silent) {
              // The pipeline can legitimately stop partway through (e.g. no
              // confident, sourced public answer was found) - any step
              // still "pending" at this point will never receive an update
              // from data.steps, so it would otherwise spin forever. Resolve
              // those explicitly instead of leaving the dialog stuck.
              const wasSkipped = data.steps.some(
                (s) => s.step === "Skipped: no public answer found"
              );
              setTimeout(() => {
                setGenerationSteps((prev) =>
                  prev.map((s) =>
                    s.status === "pending" || s.status === "in_progress"
                      ? {
                          ...s,
                          status: "skipped",
                          error: wasSkipped
                            ? "Not reached - no public religion answer was found in the sources, so no article was written."
                            : undefined,
                        }
                      : s
                  )
                );
              }, 500);
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
        const wasSkipped = (data.steps || []).some(
          (s) => s.step === "Skipped: no public answer found"
        );
        if (!silent) {
          if (wasSkipped) {
            toast.info(
              "No article written - no confident, publicly-sourced religion answer was found for this name."
            );
          } else {
            toast.error(data.error || "Failed to generate article");
          }
        }
        return { success: false, error: data.error, skipped: wasSkipped };
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

  // Update the ref so startProcessingQueue can use it
  handleGenerateArticleRef.current = handleGenerateArticle;

  const resetCreateArticleDialog = () => {
    setCreateArticleKeyword("");
    setCreateArticleStep("input");
    setPendingCreateArticle(null);
    setCreateArticleSearching(false);
    setCreateArticleDeleting(false);
  };

  const proceedWithCreateArticle = async (keyword) => {
    setCreateArticleDialogOpen(false);
    resetCreateArticleDialog();
    await handleGenerateArticle(keyword);
  };

  const handleCreateArticleSubmit = async () => {
    const keyword = createArticleKeyword.trim();
    if (!keyword) {
      toast.warning("Please enter a keyword");
      return;
    }

    try {
      setCreateArticleSearching(true);
      const response = await fetch(
        `/api/search-celebrity-url?celebrity_name=${encodeURIComponent(
          keyword
        )}&website_id=${websiteId}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to search sitemap");
      }

      const data = await response.json();

      if (data.found && data.url) {
        setPendingCreateArticle({ keyword, url: data.url });
        setCreateArticleStep("confirm");
        return;
      }

      await proceedWithCreateArticle(keyword);
    } catch (error) {
      console.error("Error searching sitemap:", error);
      toast.error(error.message || "Failed to search sitemap");
    } finally {
      setCreateArticleSearching(false);
    }
  };

  const handleConfirmReplaceArticle = async () => {
    if (!pendingCreateArticle?.keyword) return;

    const { keyword, url } = pendingCreateArticle;

    try {
      setCreateArticleDeleting(true);
      const response = await fetch("/api/wp-delete-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website_id: parseInt(websiteId),
          celebrity_name: keyword,
          post_url: url,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || "Failed to delete old article");
      }

      const data = await response.json();
      toast.success(data.message || "Old article removed");
      await proceedWithCreateArticle(keyword);
    } catch (error) {
      console.error("Error deleting old article:", error);
      toast.error(error.message || "Failed to delete old article");
    } finally {
      setCreateArticleDeleting(false);
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
              {selectedItems.size > 0 && (
                <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  {selectedItems.size} selected
                </span>
              )}
              <Button
                onClick={startProcessingQueue}
                disabled={
                  processingQueue ||
                  !website?.niche ||
                  selectedItems.size === 0
                }
                variant="default"
                className="flex items-center gap-2"
              >
                <Play
                  className={`h-4 w-4 ${
                    processingQueue ? "animate-pulse" : ""
                  }`}
                />
                {processingQueue 
                  ? "Processing..." 
                  : selectedItems.size > 0 
                    ? `Start Processing (${selectedItems.size})`
                    : "Start Processing"
                }
              </Button>
              <Button
                onClick={() => setCreateArticleDialogOpen(true)}
                disabled={
                  generatingArticle ||
                  processingQueue ||
                  fetchingTrends ||
                  createArticleSearching ||
                  createArticleDeleting
                }
                variant="outline"
                className="flex items-center gap-2"
              >
                <FileEdit className="h-4 w-4" />
                Create Article
              </Button>
              <Link href={`/ai-dashboard/${websiteId}/search-console`}>
                <Button variant="outline" className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Google Search Console Data
                </Button>
              </Link>
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
              <TabsTrigger value="cron-logs">Cron Logs</TabsTrigger>
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

                const allSelected = processingTrends.length > 0 && processingTrends.every(t => selectedItems.has(t.id));
                const someSelected = processingTrends.some(t => selectedItems.has(t.id));

                return (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <button
                              onClick={() => toggleSelectAll(processingTrends)}
                              className="flex items-center justify-center p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                              title={allSelected ? "Deselect all" : "Select all"}
                            >
                              {allSelected ? (
                                <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                              ) : someSelected ? (
                                <div className="relative">
                                  <Square className="h-5 w-5 text-gray-400" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-sm" />
                                  </div>
                                </div>
                              ) : (
                                <Square className="h-5 w-5 text-gray-400" />
                              )}
                            </button>
                          </TableHead>
                          <TableHead>Keyword</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {processingTrends.map((trend) => {
                          const isProcessing =
                            processingItems.has(trend.celebrity_name) ||
                            (processingQueue && selectedItems.has(trend.id));
                          const isSelected = selectedItems.has(trend.id);
                          return (
                            <TableRow 
                              key={trend.id}
                              className={isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""}
                            >
                              <TableCell className="w-12">
                                <button
                                  onClick={() => toggleItemSelection(trend.id)}
                                  className="flex items-center justify-center p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                  disabled={isProcessing}
                                >
                                  {isSelected ? (
                                    <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                  ) : (
                                    <Square className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                                  )}
                                </button>
                              </TableCell>
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
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteTrend(trend.id)}
                                    className="flex items-center gap-1 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </Button>
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
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteTrend(trend.id)}
                                  className="flex items-center gap-1 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </Button>
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
                          <TableHead>Wordpress URL</TableHead>
                          <TableHead className="text-right">Action</TableHead>
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
                              {(() => {
                                const urlData = celebrityUrls[trend.celebrity_name];
                                const trendDate = new Date(trend.created_at);
                                const lastmodDate = urlData.lastmod
                                  ? new Date(urlData.lastmod)
                                  : null;
                                // If the post was last modified on/around when
                                // this trend surfaced, it was created fresh for
                                // this trend. If it was already modified well
                                // before, this trend just matched a
                                // pre-existing article via the duplicate check.
                                const ONE_DAY_MS = 24 * 60 * 60 * 1000;
                                const isNew =
                                  !lastmodDate ||
                                  lastmodDate.getTime() >= trendDate.getTime() - ONE_DAY_MS;

                                return isNew ? (
                                  <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded">
                                    Completed - New
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded">
                                    Completed - Old
                                  </span>
                                );
                              })()}
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
                            <TableCell>
                              <div className="flex justify-start">
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
                            <TableCell className="text-right">
                              <div className="flex justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteTrend(trend.id)}
                                  className="flex items-center gap-1 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
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

            <TabsContent value="cron-logs">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm text-muted-foreground">
                  Results from each daily cron run (trend search, article generation, stale-article refresh).
                </p>
                <Button
                  onClick={fetchCronLogs}
                  disabled={cronLogsLoading}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${cronLogsLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              {cronLogs.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  {cronLogsLoading ? "Loading..." : "No cron runs logged yet."}
                </div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Run (started)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>New Articles</TableHead>
                        <TableHead>Refreshed</TableHead>
                        <TableHead>Trends Found</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cronLogs.map((log) => (
                        <>
                          <TableRow key={log.id}>
                            <TableCell className="whitespace-nowrap">
                              {new Date(log.started_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {log.success ? (
                                <span className="text-green-600 font-medium">Success</span>
                              ) : (
                                <span className="text-red-600 font-medium">Error</span>
                              )}
                            </TableCell>
                            <TableCell>{log.new_articles_count}</TableCell>
                            <TableCell>{log.refreshed_articles_count}</TableCell>
                            <TableCell>{log.trends_found_count}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setExpandedLogId(
                                    expandedLogId === log.id ? null : log.id
                                  )
                                }
                              >
                                {expandedLogId === log.id ? "Hide" : "Details"}
                              </Button>
                            </TableCell>
                          </TableRow>
                          {expandedLogId === log.id && (
                            <TableRow key={`${log.id}-details`}>
                              <TableCell colSpan={6}>
                                {log.error_message && (
                                  <p className="text-sm text-red-600 mb-2">
                                    {log.error_message}
                                  </p>
                                )}
                                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
                                  {JSON.stringify(log.summary, null, 2)}
                                </pre>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
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

      {/* Create Article — keyword entry */}
      <Dialog
        open={createArticleDialogOpen}
        onOpenChange={(open) => {
          setCreateArticleDialogOpen(open);
          if (!open) resetCreateArticleDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          {createArticleStep === "input" ? (
            <>
              <DialogHeader>
                <DialogTitle>Create Article</DialogTitle>
                <DialogDescription>
                  Enter a keyword. We will search the sitemap first; if an
                  existing article is found, you can confirm before replacing
                  it.
                </DialogDescription>
              </DialogHeader>
              <Input
                placeholder="e.g. Taylor Swift"
                value={createArticleKeyword}
                onChange={(e) => setCreateArticleKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !createArticleSearching) {
                    e.preventDefault();
                    handleCreateArticleSubmit();
                  }
                }}
                disabled={createArticleSearching}
                autoFocus
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateArticleDialogOpen(false);
                    resetCreateArticleDialog();
                  }}
                  disabled={createArticleSearching}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateArticleSubmit}
                  disabled={
                    generatingArticle ||
                    createArticleSearching ||
                    createArticleDeleting
                  }
                >
                  {createArticleSearching ? "Searching..." : "Generate"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Article already exists</DialogTitle>
                <DialogDescription>
                  Found in sitemap for &quot;{pendingCreateArticle?.keyword}
                  &quot;:
                </DialogDescription>
              </DialogHeader>
              {pendingCreateArticle?.url && (
                <a
                  href={pendingCreateArticle.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
                >
                  {pendingCreateArticle.url}
                </a>
              )}
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Delete the old article and featured image, then create a fresh
                article for this keyword?
              </p>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateArticleStep("input");
                    setPendingCreateArticle(null);
                  }}
                  disabled={createArticleDeleting}
                >
                  No, cancel
                </Button>
                <Button
                  onClick={handleConfirmReplaceArticle}
                  disabled={createArticleDeleting || generatingArticle}
                >
                  {createArticleDeleting
                    ? "Deleting..."
                    : "Yes, replace article"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

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
                      "Answer extracted": "Sourced Answer Confirmed",
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
                          : step.status === "skipped"
                          ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200"
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
                        {step.status === "skipped" && (
                          <span className="text-xl">⏭️</span>
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
                          <p
                            className={`text-xs mt-1 opacity-75 ${
                              step.status === "skipped"
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
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
