export const PIPELINE_STATUS = {
  DRAFT_READY: "draft_ready",
  PUBLISHING: "publishing",
  PUBLISHED: "published",
  PUBLISH_FAILED: "publish_failed",
};

export const MAX_PUBLISH_ATTEMPTS = 5;
export const RETRY_BASE_MINUTES = 5;
export const RETRY_MAX_MINUTES = 40;

export function isInvocationTimeout(status, text) {
  if (status === 504) return true;
  const t = String(text || "").toLowerCase();
  return t.includes("function_invocation_timeout");
}

export function isRetryablePublishError(status, text) {
  const code = Number(status);
  const t = String(text || "").toLowerCase();

  if (code === 401 || code === 403) return false;
  if (
    t.includes("isquotaerror") ||
    t.includes("out of searches") ||
    t.includes("insufficient credits") ||
    t.includes("not enough credits") ||
    t.includes("rate limit") ||
    (t.includes("quota") && code === 429) ||
    code === 429
  ) {
    return false;
  }

  if (code === 500 || code === 502 || code === 503 || code === 504) return true;
  if (isInvocationTimeout(code, t)) return true;
  if (t.includes("timeout") || t.includes("gateway") || t.includes("temporar")) {
    return true;
  }
  if (t.includes("failed to upload featured image") || t.includes("rest_upload")) {
    return true;
  }
  if (code === 400 && (t.includes("image") || t.includes("upload") || t.includes("sideload"))) {
    return true;
  }

  return false;
}

export function nextRetryAt(publishAttempts, now = new Date()) {
  const exponent = Math.max(0, Number(publishAttempts) || 0);
  const minutes = Math.min(
    RETRY_MAX_MINUTES,
    RETRY_BASE_MINUTES * Math.pow(2, exponent)
  );
  return new Date(now.getTime() + minutes * 60 * 1000);
}
