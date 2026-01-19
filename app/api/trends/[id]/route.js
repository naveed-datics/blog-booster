import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";

// DELETE - Delete a single trend (keyword) by id
export async function DELETE(request, { params }) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const trendId = parseInt(resolvedParams.id);

    if (!resolvedParams.id || isNaN(trendId) || trendId <= 0) {
      return NextResponse.json(
        { error: "Invalid trend ID" },
        { status: 400 }
      );
    }

    // Delete the trend row
    await query("DELETE FROM trends WHERE id = $1", [trendId]);

    return NextResponse.json({
      message: "Trend deleted successfully",
      id: trendId,
    });
  } catch (error) {
    console.error("Error deleting trend:", error);
    return NextResponse.json(
      { error: "Failed to delete trend", details: error.message },
      { status: 500 }
    );
  }
}


