import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cronAuth";
import { createWordPressPost } from "@/lib/wpPost";

export const maxDuration = 300;

// GET endpoint for WordPress post creation
export async function GET(request) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const postContent = searchParams.get("post_content") || "";
    const keyword = searchParams.get("keyword") || "";
    const websiteId = searchParams.get("website_id") || null;

    if (!keyword.trim()) {
      return NextResponse.json(
        { error: "keyword parameter is required" },
        { status: 400 }
      );
    }
    if (!postContent.trim()) {
      return NextResponse.json(
        { error: "post_content parameter is required" },
        { status: 400 }
      );
    }

    let answer = null;
    const answerParam = searchParams.get("answer");
    if (answerParam) {
      try {
        answer = JSON.parse(answerParam);
      } catch (e) {
        console.error("Failed to parse answer query param:", e);
      }
    }

    const cookies = request.headers.get("cookie") || "";

    const result = await createWordPressPost({
      title: keyword.trim(),
      postContent,
      websiteId,
      answer,
      cookies,
      request,
    });

    if (result.skipped) {
      return NextResponse.json({
        status: "skipped",
        skip_stage: result.skipStage,
        skip_detail: result.skipDetail,
        message: `Not published: ${result.skipStage} - ${result.skipDetail}`,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in wp-create-post API:", error);
    return NextResponse.json(
      {
        error: "Unexpected error",
        message: error.message,
        status_code: error.statusCode || undefined,
      },
      { status: error.statusCode || 500 }
    );
  }
}

// POST endpoint (alternative method - handles large content without URL length limits)
export async function POST(request) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const postContent = body.post_content || "";
    const keyword = body.keyword || "";
    const websiteId = body.website_id || null;
    const answer = body.answer || null;

    if (!keyword.trim()) {
      return NextResponse.json({ error: "keyword is required" }, { status: 400 });
    }
    if (!postContent.trim()) {
      return NextResponse.json({ error: "post_content is required" }, { status: 400 });
    }

    const cookies = request.headers.get("cookie") || "";

    const result = await createWordPressPost({
      title: keyword.trim(),
      postContent,
      websiteId,
      answer,
      cookies,
      request,
    });

    if (result.skipped) {
      return NextResponse.json({
        status: "skipped",
        skip_stage: result.skipStage,
        skip_detail: result.skipDetail,
        message: `Not published: ${result.skipStage} - ${result.skipDetail}`,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in wp-create-post API (POST):", error);
    return NextResponse.json(
      {
        error: "Unexpected error",
        message: error.message,
        status_code: error.statusCode || undefined,
      },
      { status: error.statusCode || 500 }
    );
  }
}
