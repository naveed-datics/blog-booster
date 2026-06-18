"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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
import { ArrowLeft, RefreshCw, ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const BATCH_LIMIT = 8;

function formatGscOAuthError(code) {
  if (!code) return "";
  if (code === "access_denied") {
    return "Google access was denied. Grant permission to connect Search Console.";
  }
  return `Google OAuth error: ${code.replace(/_/g, " ")}`;
}

function shouldShowGscReconnect({ oauthError, error, oauthConfigured }) {
  if (!oauthConfigured) return false;
  if (oauthError) return true;
  if (!error) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes("connect google search console") ||
    lower.includes("not connected") ||
    lower.includes("invalid_grant") ||
    lower.includes("access_denied") ||
    lower.includes("oauth") ||
    lower.includes("token")
  );
}

async function parseScanResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    if (/an error occurred|function_invocation_timeout/i.test(text)) {
      throw new Error(
        "Scan timed out on the server. Partial results are shown — run Scan again to continue (cached pages are faster)."
      );
    }
    throw new Error(`Unexpected server response: ${text.slice(0, 120)}`);
  }
  return response.json();
}

export default function SearchConsolePage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const websiteId = params.id;

  const [website, setWebsite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [error, setError] = useState("");
  const [noIndexPages, setNoIndexPages] = useState([]);
  const [issues, setIssues] = useState([]);
  const [scanProgress, setScanProgress] = useState({
    totalUrls: 0,
    inspected: 0,
    hasMore: false,
  });
  const [siteUrl, setSiteUrl] = useState("");
  const oauthError = searchParams.get("error");

  useEffect(() => {
    if (searchParams.get("gscConnected") === "true" || searchParams.get("connected") === "true") {
      toast.success("Google Search Console connected");
    }
    if (oauthError) {
      toast.error(formatGscOAuthError(oauthError));
      setConnected(false);
    }
  }, [searchParams, oauthError]);

  const fetchWebsite = useCallback(async () => {
    const response = await fetch("/api/websites");
    if (!response.ok) {
      throw new Error("Failed to load website");
    }
    const data = await response.json();
    const found = data.websites?.find((w) => String(w.id) === String(websiteId));
    if (!found) {
      throw new Error("Website not found");
    }
    setWebsite(found);
  }, [websiteId]);

  const fetchConnectionStatus = useCallback(async () => {
    const response = await fetch("/api/search-console/status");
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    setOauthConfigured(Boolean(data.oauthConfigured));
    setConnected(Boolean(data.connected));
    return Boolean(data.connected);
  }, []);

  const runScan = useCallback(
    async (refresh = false) => {
      setScanning(true);
      setError("");

      let offset = 0;
      let hasMore = true;
      let totalUrls = 0;
      let inspectedCount = 0;
      const collectedNoIndex = [];
      const collectedIssues = [];

      try {
        while (hasMore) {
          const query = new URLSearchParams({
            offset: String(offset),
            limit: String(BATCH_LIMIT),
            refresh: offset === 0 && refresh ? "true" : "false",
          });

          const response = await fetch(
            `/api/search-console/${websiteId}?${query.toString()}`
          );
          const data = await parseScanResponse(response);

          if (response.status === 401 && data.needsAuth) {
            setConnected(false);
            setError("Connect Google Search Console to scan your site.");
            return;
          }

          if (!response.ok || !data.success) {
            throw new Error(data.details || data.error || "Scan failed");
          }

          setSiteUrl(data.data.siteUrl);
          totalUrls = data.data.scan.totalUrls;
          inspectedCount = offset + data.data.scan.inspected;
          hasMore = data.data.scan.hasMore;

          collectedNoIndex.push(...(data.data.noIndexPages ?? []));
          collectedIssues.push(...(data.data.issues ?? []));

          setNoIndexPages([...collectedNoIndex]);
          setIssues([...collectedIssues]);
          setScanProgress({
            totalUrls,
            inspected: inspectedCount,
            hasMore,
          });

          if (hasMore && data.data.scan.nextOffset != null) {
            offset = data.data.scan.nextOffset;
          } else {
            break;
          }
        }

        toast.success(
          `Scan complete: ${collectedNoIndex.length} noindex, ${collectedIssues.length} issues found`
        );
      } catch (scanError) {
        console.error("Scan error:", scanError);
        setError(scanError.message);
        if (collectedNoIndex.length > 0 || collectedIssues.length > 0) {
          toast.warning(
            `${scanError.message} (${collectedNoIndex.length} noindex, ${collectedIssues.length} issues so far)`
          );
        } else {
          toast.error(scanError.message);
        }
      } finally {
        setScanning(false);
      }
    },
    [websiteId]
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    if (status !== "authenticated" || !websiteId) {
      return;
    }

    async function init() {
      try {
        setLoading(true);
        await fetchWebsite();
        const isConnected = await fetchConnectionStatus();
        if (isConnected) {
          await runScan(false);
        }
      } catch (initError) {
        setError(initError.message);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [status, websiteId, router, fetchWebsite, fetchConnectionStatus, runScan]);

  const handleConnect = () => {
    window.location.href = `/api/search-console/auth?websiteId=${websiteId}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto flex items-center justify-center h-64">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <Link href={`/ai-dashboard/${websiteId}`}>
          <Button variant="ghost" className="mb-4 flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to AI Dashboard
          </Button>
        </Link>

        <div className="mb-6">
          <h1 className="text-4xl font-bold mb-2">
            Google Search Console — {website?.website_name || "Website"}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {website?.website_url}
            {siteUrl && (
              <span className="ml-2 text-sm">(GSC property: {siteUrl})</span>
            )}
          </p>
        </div>

        {!oauthConfigured && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
              Set up your Google OAuth credentials first in Manage Websites →
              Google API Setup (Client ID + Client Secret from Google Cloud).
            </p>
            <Link href="/add-website">
              <Button variant="outline" size="sm">
                Open Google API Setup
              </Button>
            </Link>
          </div>
        )}

        {oauthConfigured && oauthError && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300 mb-3">
              {formatGscOAuthError(oauthError)}
            </p>
            <Button onClick={handleConnect}>Reconnect Google Search Console</Button>
          </div>
        )}

        {oauthConfigured && !connected && !oauthError && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
              Connect your Google account to inspect indexing status via Search
              Console. Your account must have access to this site&apos;s GSC
              property.
            </p>
            <Button onClick={handleConnect}>Connect Google Search Console</Button>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            <p>{error}</p>
            {shouldShowGscReconnect({ oauthError, error, oauthConfigured }) && (
              <Button
                onClick={handleConnect}
                variant="outline"
                size="sm"
                className="mt-3"
              >
                Reconnect Google Search Console
              </Button>
            )}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">Indexing Report</h2>
              {scanning || scanProgress.totalUrls > 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {scanning
                    ? `Scanning… ${scanProgress.inspected} / ${scanProgress.totalUrls} URLs`
                    : `Inspected ${scanProgress.inspected} / ${scanProgress.totalUrls} URLs`}
                </p>
              ) : null}
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2 max-w-2xl">
                Lists noindex pages and indexing issues from Google URL
                Inspection. Large sites scan in batches (~2,000 inspections/day
                quota). Rewrite and reindex workflow is planned for a later
                phase.
              </p>
            </div>
            <div className="flex gap-2">
              {connected && (
                <Button
                  onClick={() => runScan(true)}
                  disabled={scanning}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`}
                  />
                  {scanning ? "Scanning…" : "Refresh Scan"}
                </Button>
              )}
            </div>
          </div>

          <Tabs defaultValue="noindex" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="noindex">
                No Index Pages ({noIndexPages.length})
              </TabsTrigger>
              <TabsTrigger value="issues">
                Issues ({issues.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="noindex">
              {noIndexPages.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm py-8 text-center">
                  {scanning
                    ? "Scanning for noindex pages…"
                    : connected
                      ? "No noindex pages found in the scanned URLs."
                      : "Connect Google to start scanning."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Indexing State</TableHead>
                      <TableHead>Coverage State</TableHead>
                      <TableHead>Last Crawl</TableHead>
                      <TableHead className="text-right">GSC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {noIndexPages.map((page) => (
                      <TableRow key={page.url}>
                        <TableCell className="max-w-md truncate">
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {page.url}
                          </a>
                        </TableCell>
                        <TableCell>{page.indexingState || "—"}</TableCell>
                        <TableCell>{page.coverageState || "—"}</TableCell>
                        <TableCell>
                          {page.lastCrawlTime
                            ? new Date(page.lastCrawlTime).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {page.inspectLink && (
                            <a
                              href={page.inspectLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                            >
                              Inspect
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="issues">
              {issues.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm py-8 text-center">
                  {scanning
                    ? "Scanning for indexing issues…"
                    : connected
                      ? "No indexing issues found in the scanned URLs."
                      : "Connect Google to start scanning."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Issue Type</TableHead>
                      <TableHead>Coverage State</TableHead>
                      <TableHead>Verdict</TableHead>
                      <TableHead className="text-right">GSC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issues.map((issue) => (
                      <TableRow key={issue.url}>
                        <TableCell className="max-w-md truncate">
                          <a
                            href={issue.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {issue.url}
                          </a>
                        </TableCell>
                        <TableCell>{issue.issueType || "—"}</TableCell>
                        <TableCell>{issue.coverageState || "—"}</TableCell>
                        <TableCell>{issue.verdict || "—"}</TableCell>
                        <TableCell className="text-right">
                          {issue.inspectLink && (
                            <a
                              href={issue.inspectLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                            >
                              Inspect
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
