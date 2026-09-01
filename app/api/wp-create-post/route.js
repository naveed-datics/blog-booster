import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cronAuth";
import { createWordPressPost, updateWordPressPost } from "@/lib/wpPost";
import { assertPublishQuota } from "@/lib/publishQuota";

export const maxDuration = 300;

async function handlePublish(body, cookies, request) {
  const postContent = body.post_content || "";
  const keyword = body.keyword || "";
  const websiteId = body.website_id || null;
  const answer = body.answer || null;
  const pipelineAction = body.pipeline_action || "create-new";
  const postId = body.post_id ? parseInt(body.post_id, 10) : null;
  const bulkRemediation = body.bulk_remediation === true;

  if (!keyword.trim()) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }

  const isUpdate =
    postId &&
    ["light-update", "full-rewrite", "revive-draft", "consolidate"].includes(
      pipelineAction
    );

  if (!isUpdate && !postContent.trim()) {
    return NextResponse.json({ error: "post_content is required" }, { status: 400 });
  }

  if (websiteId) {
    const quota = await assertPublishQuota(websiteId, pipelineAction, {
      bulkRemediation,
    });
    if (!quota.allowed) {
      return NextResponse.json(
        { status: "deferred", defer_reason: quota.reason },
        { status: 429 }
      );
    }
  }

  const result = isUpdate
    ? await updateWordPressPost({
        postId,
        title: keyword.trim(),
        postContent,
        websiteId,
        answer,
        cookies,
        request,
        pipelineAction,
      })
    : await createWordPressPost({
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
}

export async function GET(request) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
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
    return handlePublish(
      {
        post_content: searchParams.get("post_content") || "",
        keyword: searchParams.get("keyword") || "",
        website_id: searchParams.get("website_id") || null,
        answer,
        pipeline_action: searchParams.get("pipeline_action") || "create-new",
        post_id: searchParams.get("post_id") || null,
        bulk_remediation: searchParams.get("bulk_remediation") === "1",
      },
      cookies,
      request
    );
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

export async function POST(request) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const cookies = request.headers.get("cookie") || "";
    return handlePublish(body, cookies, request);
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
