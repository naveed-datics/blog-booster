import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PUBLISH_ATTEMPTS,
  RETRY_BASE_MINUTES,
  isInvocationTimeout,
  isRetryablePublishError,
  nextRetryAt,
  PIPELINE_STATUS,
} from "./articlePipeline.js";

describe("isRetryablePublishError", () => {
  it("retries WordPress gateway timeouts", () => {
    assert.equal(isRetryablePublishError(504, "Gateway Timeout"), true);
    assert.equal(
      isRetryablePublishError(
        500,
        'Image upload failed: 500 Internal Server Error. {"code":"rest_upload_sideload_error"}'
      ),
      true
    );
    assert.equal(isRetryablePublishError(502, "Bad Gateway"), true);
    assert.equal(isRetryablePublishError(503, "Service Unavailable"), true);
  });

  it("retries Vercel function timeouts", () => {
    assert.equal(
      isRetryablePublishError(
        504,
        "FUNCTION_INVOCATION_TIMEOUT iad1:iad1::48smd"
      ),
      true
    );
  });

  it("does not retry auth failures or quota", () => {
    assert.equal(isRetryablePublishError(401, "Unauthorized"), false);
    assert.equal(isRetryablePublishError(403, "Forbidden"), false);
    assert.equal(isRetryablePublishError(429, "rate limit exceeded"), false);
  });
});

describe("isInvocationTimeout", () => {
  it("matches Vercel 504 timeout payloads", () => {
    assert.equal(
      isInvocationTimeout(
        504,
        "FUNCTION_INVOCATION_TIMEOUT\niad1:iad1::48smd-1787809130852"
      ),
      true
    );
    assert.equal(isInvocationTimeout(200, '{"success":true}'), false);
    assert.equal(isInvocationTimeout(500, "Failed to write blog"), false);
  });
});

describe("nextRetryAt", () => {
  it("uses exponential backoff from five minutes", () => {
    const t0 = nextRetryAt(0, new Date("2026-08-27T05:00:00.000Z"));
    const t1 = nextRetryAt(1, new Date("2026-08-27T05:00:00.000Z"));
    const t2 = nextRetryAt(2, new Date("2026-08-27T05:00:00.000Z"));
    assert.equal(t0.toISOString(), "2026-08-27T05:05:00.000Z");
    assert.equal(t1.toISOString(), "2026-08-27T05:10:00.000Z");
    assert.equal(t2.toISOString(), "2026-08-27T05:20:00.000Z");
    assert.equal(RETRY_BASE_MINUTES, 5);
    assert.equal(MAX_PUBLISH_ATTEMPTS, 5);
    assert.equal(PIPELINE_STATUS.DRAFT_READY, "draft_ready");
  });
});
