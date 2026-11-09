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
