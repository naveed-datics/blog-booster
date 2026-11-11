import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST - Delete several trends at once.
//
// Takes explicit ids rather than a filter description because the
// Processing and Update tabs are client-side views of the same `trends`
// table (no WP url yet vs. has a url but is stale). Re-deriving those
// filters here would mean two definitions of each view that could drift,
// and a "delete all" that removed rows the tab never showed.
export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const rawIds = body?.ids;

    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json(
        { error: "ids must be a non-empty array of trend ids" },
        { status: 400 }
      );
    }

    const ids = [...new Set(rawIds.map((id) => parseInt(id, 10)))].filter(
      (id) => Number.isInteger(id) && id > 0
    );

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "No valid trend ids supplied" },
        { status: 400 }
      );
    }

    // Scoped to the website when one is given, so a stale id from another
    // site cannot be deleted through this endpoint.
    const websiteId = parseInt(body?.website_id, 10);
    const result = Number.isInteger(websiteId)
      ? await query(
          "DELETE FROM trends WHERE id = ANY($1::int[]) AND website_id = $2 RETURNING id",
          [ids, websiteId]
        )
      : await query("DELETE FROM trends WHERE id = ANY($1::int[]) RETURNING id", [ids]);

    return NextResponse.json({
      message: `Deleted ${result.rowCount} trend(s)`,
      deleted: result.rowCount,
      ids: result.rows.map((row) => row.id),
    });
  } catch (error) {
    console.error("Error bulk-deleting trends:", error);
    return NextResponse.json(
      { error: "Failed to delete trends", details: error.message },
      { status: 500 }
    );
  }
}
