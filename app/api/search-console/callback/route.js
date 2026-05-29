import { NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getOAuthCallbackRedirect,
  parseOAuthState,
  saveTokens,
} from "@/lib/google-search-console";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000";

    if (error) {
      const payload = parseOAuthState(state);
      if (payload) {
        return NextResponse.redirect(
          getOAuthCallbackRedirect(payload, { error })
        );
      }
      return NextResponse.redirect(
        `${baseUrl}/dashboard?error=${encodeURIComponent(error)}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${baseUrl}/dashboard?error=${encodeURIComponent("Missing OAuth code or state")}`
      );
    }

    const payload = parseOAuthState(state);
    if (!payload?.userId) {
      return NextResponse.redirect(
        `${baseUrl}/dashboard?error=${encodeURIComponent("Invalid OAuth state")}`
      );
    }

    const tokens = await exchangeCodeForTokens(parseInt(payload.userId), code);
    await saveTokens(parseInt(payload.userId), tokens);

    return NextResponse.redirect(
      getOAuthCallbackRedirect(payload, { gscConnected: "true" })
    );
  } catch (error) {
    console.error("GSC callback error:", error);
    const baseUrl =
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000";
    return NextResponse.redirect(
      `${baseUrl}/dashboard?error=${encodeURIComponent(error.message)}`
    );
  }
}
