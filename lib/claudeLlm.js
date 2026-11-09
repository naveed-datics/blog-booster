import { getSetting, requireSetting, getNumberSetting } from './settings.js';

/**
 * Client for the Claude LLM relay at /api/v1/run.
 *
 * The API is asynchronous: POST /api/v1/run returns 202 with a job_id, and
 * the result is collected from GET /api/v1/jobs/:id once status is DONE.
 * Typical end-to-end latency is ~10s, so every helper here polls.
 *
 * This replaces the previous Azure OpenAI chat/completions calls. There is
 * no messages array - the API takes a `context` object plus an
 * `instructions` string, so the old system/user prompt pair maps onto
 * instructions (the system role) and context.text (the user content).
 */

const DEFAULT_BASE_URL = 'https://claude-llm.vercel.app';
const DEFAULT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;
const SUBMIT_RETRIES = 2;

/** Error carrying enough detail for callers to decide between fail-open and 5xx. */
export class ClaudeLlmError extends Error {
  constructor(message, { status, phase, jobId } = {}) {
    super(message);
    this.name = 'ClaudeLlmError';
    this.status = status;
    this.phase = phase;
    this.jobId = jobId;
  }
}

async function getConfig() {
  const apiKey = await requireSetting('CLAUDE_LLM_API_KEY', 'Claude LLM API key');
  const configuredBase = await getSetting('CLAUDE_LLM_BASE_URL');
  const timeoutMs = await getNumberSetting('CLAUDE_LLM_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);

  const baseUrl = (configuredBase || DEFAULT_BASE_URL).replace(/\/+$/, '');
  return { apiKey, baseUrl, timeoutMs };
}

/** True when the Claude LLM key is present, for callers that degrade gracefully. */
export async function isClaudeLlmConfigured() {
  const apiKey = await getSetting('CLAUDE_LLM_API_KEY');
  return Boolean(apiKey);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Submits a job and returns its id.
 * @param {{ context: object, instructions: string }} payload
 */
async function submitJob({ apiKey, baseUrl }, payload) {
  let lastError = null;

  for (let attempt = 0; attempt <= SUBMIT_RETRIES; attempt += 1) {
    if (attempt > 0) await sleep(1_000 * attempt);

    let response;
    try {
      response = await fetch(`${baseUrl}/api/v1/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      lastError = new ClaudeLlmError(`Claude LLM request failed: ${error.message}`, {
        phase: 'submit',
      });
      continue;
    }

    // 4xx is a caller problem (bad key, invalid body) - retrying cannot help.
    if (response.status >= 400 && response.status < 500) {
      const detail = await response.text().catch(() => '');
      throw new ClaudeLlmError(
        `Claude LLM rejected the request (${response.status}): ${detail.slice(0, 300)}`,
        { status: response.status, phase: 'submit' }
      );
    }

    if (!response.ok) {
      lastError = new ClaudeLlmError(`Claude LLM submit failed: ${response.status}`, {
        status: response.status,
        phase: 'submit',
      });
      continue;
    }

    const data = await response.json().catch(() => null);
    if (!data?.job_id) {
      lastError = new ClaudeLlmError('Claude LLM response did not include a job_id', {
        phase: 'submit',
      });
      continue;
    }

    return data.job_id;
  }

  throw lastError || new ClaudeLlmError('Claude LLM submit failed', { phase: 'submit' });
}

/** Polls a job until it reaches a terminal state or the timeout elapses. */
async function awaitJob({ apiKey, baseUrl, timeoutMs }, jobId) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let response;
    try {
      response = await fetch(`${baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch {
      // Transient network blip - keep polling until the deadline.
      continue;
    }

    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        const detail = await response.text().catch(() => '');
        throw new ClaudeLlmError(
          `Claude LLM job lookup failed (${response.status}): ${detail.slice(0, 200)}`,
          { status: response.status, phase: 'poll', jobId }
        );
      }
      continue;
    }

    const data = await response.json().catch(() => null);
    if (!data) continue;

    const status = String(data.status || '').toUpperCase();

    if (status === 'DONE') {
      // `result` is a string for prose/HTML output, but the API parses JSON
      // output and hands back a real object/array. Both are valid; callers
      // pick runClaude (text) or runClaudeJson (structured) accordingly.
      const isEmpty =
        data.result === null ||
        data.result === undefined ||
        (typeof data.result === 'string' && !data.result.trim());

      if (isEmpty) {
        throw new ClaudeLlmError('Claude LLM job finished with an empty result', {
          phase: 'poll',
          jobId,
        });
      }
      return data.result;
    }

    if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
      throw new ClaudeLlmError(
        `Claude LLM job ${status.toLowerCase()}: ${data.error || 'no error detail'}`,
        { phase: 'poll', jobId }
      );
    }
  }

  throw new ClaudeLlmError(
    `Claude LLM job did not finish within ${Math.round(timeoutMs / 1000)}s`,
    { phase: 'timeout', jobId }
  );
}

/**
 * Runs one completion and returns the raw result, which is a string for
 * prose/HTML output and a parsed object/array when the model emits JSON.
 * Most callers want runClaudeText or runClaudeJson instead.
 *
 * @param {object} options
 * @param {string} options.instructions What the model should do (old system prompt).
 * @param {string} [options.text] Primary content (old user prompt).
 * @param {object} [options.context] Extra structured context merged alongside `text`.
 * @returns {Promise<string|object|Array>}
 */
export async function runClaude({ instructions, text, context }) {
  if (!instructions || !instructions.trim()) {
    throw new ClaudeLlmError('instructions is required');
  }

  const config = await getConfig();

  const payload = {
    context: {
      ...(context || {}),
      ...(text !== undefined ? { text: String(text) } : {}),
    },
    instructions,
  };

  if (payload.context.text === undefined && Object.keys(payload.context).length === 0) {
    // The API rejects an empty context with 400; make the intent explicit.
    payload.context.text = '';
  }

  const jobId = await submitJob(config, payload);
  return awaitJob(config, jobId);
}

/** Strips markdown code fences the model sometimes wraps output in. */
export function stripCodeFences(raw) {
  if (typeof raw !== 'string' || !raw) return '';
  return raw
    .replace(/^\s*```(?:json|html|markdown)?\s*\n?/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

/**
 * Runs a completion expected to return prose or HTML, as a trimmed string.
 * If the API parsed the output into an object (it does that for JSON), it is
 * re-serialized so the caller always gets a string.
 *
 * @returns {Promise<string>}
 */
export async function runClaudeText({ instructions, text, context }) {
  const result = await runClaude({ instructions, text, context });
  if (typeof result === 'string') return stripCodeFences(result);
  return JSON.stringify(result);
}

/**
 * Runs a completion expected to return JSON.
 *
 * The API parses JSON output itself and returns a real object/array, so the
 * common path needs no parsing. A string result is still handled: fences are
 * stripped, then the outermost {...} or [...] block is extracted as a
 * fallback for output wrapped in commentary.
 *
 * @returns {Promise<any|null>} null when the output cannot be parsed.
 */
export async function runClaudeJson({ instructions, text, context }) {
  const result = await runClaude({ instructions, text, context });

  if (result && typeof result === 'object') return result;

  const cleaned = stripCodeFences(result);
  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
