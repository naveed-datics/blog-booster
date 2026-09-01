import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cronAuth";

/**
 * DEPRECATED: update-stale-articles read content.rendered and caused ez-toc pollution.
 * Trend-driven updates now go through generate-article + personPageRouter (light-update).
 */
export async function GET(request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    deprecated: true,
    message:
      "Disabled. Use generate-article with personPageRouter (light-update / full-rewrite).",
    updated: 0,
    results: [],
  });
}
