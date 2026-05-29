import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuthUrl } from "@/lib/google-search-console";

export async function GET(request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const websiteId = searchParams.get("websiteId");
    const returnTo = searchParams.get("returnTo") || "search-console";

    if (!websiteId) {
      return NextResponse.json(
        { error: "websiteId query parameter is required" },
        { status: 400 }
      );
    }

    const authUrl = await getAuthUrl(
      parseInt(session.user.id),
      websiteId,
      returnTo
    );
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("GSC auth error:", error);
    const { searchParams } = new URL(request.url);
    const websiteId = searchParams.get("websiteId");
    const returnTo = searchParams.get("returnTo") || "search-console";
    const baseUrl =
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000";

    if (websiteId && returnTo === "add-website") {
      return NextResponse.redirect(
        `${baseUrl}/add-website?edit=${websiteId}&error=${encodeURIComponent(error.message)}`
      );
    }

    return NextResponse.json(
      { error: "Failed to start Google OAuth", details: error.message },
      { status: 500 }
    );
  }
}
