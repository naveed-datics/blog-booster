import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasGscConnection, hasOAuthConfig } from "@/lib/google-search-console";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const oauthConfigured = await hasOAuthConfig(userId);
    const connected = await hasGscConnection(userId);

    return NextResponse.json({
      success: true,
      oauthConfigured,
      connected,
    });
  } catch (error) {
    console.error("GSC status error:", error);
    return NextResponse.json(
      { error: "Failed to check GSC connection", details: error.message },
      { status: 500 }
    );
  }
}
