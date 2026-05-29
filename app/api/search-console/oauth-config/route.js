import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getOAuthConfigForDisplay,
  saveOAuthConfig,
} from "@/lib/google-search-console";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await getOAuthConfigForDisplay(parseInt(session.user.id));

    return NextResponse.json({ success: true, ...config });
  } catch (error) {
    console.error("GSC oauth config GET error:", error);
    return NextResponse.json(
      { error: "Failed to load OAuth config", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { client_id, client_secret } = await request.json();

    if (!client_id?.trim() || !client_secret?.trim()) {
      return NextResponse.json(
        { error: "Client ID and Client Secret are required" },
        { status: 400 }
      );
    }

    await saveOAuthConfig(
      parseInt(session.user.id),
      client_id,
      client_secret
    );

    const config = await getOAuthConfigForDisplay(parseInt(session.user.id));

    return NextResponse.json({
      success: true,
      message: "Google OAuth credentials saved",
      ...config,
    });
  } catch (error) {
    console.error("GSC oauth config POST error:", error);
    return NextResponse.json(
      { error: "Failed to save OAuth config", details: error.message },
      { status: 500 }
    );
  }
}
