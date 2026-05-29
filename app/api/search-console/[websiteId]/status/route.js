import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { getWebsiteGscStatus } from "@/lib/google-search-console";

export async function GET(request, { params }) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const websiteId = parseInt(params.websiteId);

    if (Number.isNaN(websiteId)) {
      return NextResponse.json({ error: "Invalid website ID" }, { status: 400 });
    }

    const result = await query(
      "SELECT id, website_url FROM websites WHERE id = $1 AND user_id = $2",
      [websiteId, userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Website not found or access denied" },
        { status: 404 }
      );
    }

    const website = result.rows[0];
    const status = await getWebsiteGscStatus(userId, website.website_url);

    return NextResponse.json({
      success: true,
      websiteId,
      ...status,
    });
  } catch (error) {
    console.error("GSC website status error:", error);
    return NextResponse.json(
      {
        error: "Failed to check Search Console status",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
