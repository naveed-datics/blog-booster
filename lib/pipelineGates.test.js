import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPipelineGates, classifySpikeTier } from './pipelineGates.js';
import { __setSettingsOverrideForTests } from './settings.js';

// Configuration moved from env vars into app_settings, so these tests inject
// settings directly instead of mutating process.env - no database needed.
function withSettings(values) {
  __setSettingsOverrideForTests(values);
}

test('classifySpikeTier defaults to B with empty context', () => {
  assert.equal(classifySpikeTier({}), 'B');
});

test('rising batch soft-passes faith news and does not block on tier B', async () => {
  // No Tavily/Serp keys configured when alreadyInRisingBatch + soft faith path
  withSettings({ RECOVERY_MODE: 'true' });

  try {
    const result = await runPipelineGates('Seth Moulton', {
      alreadyInRisingBatch: true,
    });

    assert.equal(result.passed, true);
    assert.equal(result.evidence.trending24h.passed, true);
  } finally {
    withSettings(null);
  }
});

test('recovery tier B with spike context still fails without rising batch', async () => {
  withSettings({ RECOVERY_MODE: 'true' });

  try {
    const result = await runPipelineGates('Seth Moulton', {
      alreadyInRisingBatch: false,
      spikeContext: { headline: 'Senator makes statement', summary: 'routine news' },
      gateEvidence: {
        trending24h: { passed: true, reason: 'test' },
        faithNews72h: { passed: true, reason: 'test' },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.failures.some((f) => f.gate === 'recovery_spike_tier'));
  } finally {
    withSettings(null);
  }
});

// Regression: a faith-news miss forgiven as a soft fail while the trend was
// fresh must stay forgiven once the row ages out of the 24h rising-batch
// window. Before this, "Generate Article" on a day-old trend re-raised the
// stored soft fail as a hard failure and queued it for review instead.
test('stored soft_fail faith news does not re-fail after the rising-batch window', async () => {
  withSettings({});

  const storedEvidence = {
    spikeTier: 'B',
    trending24h: {
      passed: true,
      reason: 'discovered from rising trends batch',
      skipped: false,
    },
    faithNews72h: {
      passed: false,
      reason: 'only 0 reputable faith news in 72h (soft — rising batch; answer gate still applies)',
      soft_fail: true,
      faith_news_count: 0,
    },
  };

  try {
    const fresh = await runPipelineGates('Neil Armstrong', {
      gateEvidence: storedEvidence,
      alreadyInRisingBatch: true,
    });
    assert.equal(fresh.passed, true);

    const aged = await runPipelineGates('Neil Armstrong', {
      gateEvidence: storedEvidence,
      alreadyInRisingBatch: false,
    });
    assert.equal(aged.passed, true, 'aged replay of a soft fail must still pass');
    assert.deepEqual(aged.failures, []);
  } finally {
    withSettings(null);
  }
});

test('a genuine faith-news hard fail still blocks outside a rising batch', async () => {
  withSettings({});

  try {
    const result = await runPipelineGates('Someone Obscure', {
      gateEvidence: {
        spikeTier: 'B',
        trending24h: { passed: true, reason: 'ok', skipped: false },
        faithNews72h: {
          passed: false,
          reason: 'only 1 reputable faith news in 72h',
          faith_news_count: 1,
        },
      },
      alreadyInRisingBatch: false,
    });

    assert.equal(result.passed, false);
    assert.ok(result.failures.some((f) => f.gate === 'faith_news'));
  } finally {
    withSettings(null);
  }
});
