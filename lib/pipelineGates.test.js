import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPipelineGates, classifySpikeTier } from './pipelineGates.js';

test('classifySpikeTier defaults to B with empty context', () => {
  assert.equal(classifySpikeTier({}), 'B');
});

test('rising batch soft-passes faith news and does not block on tier B', async () => {
  // No Tavily/Serp keys needed when alreadyInRisingBatch + soft faith path
  const prevTavily = process.env.TAVILY_API_KEY;
  const prevRecovery = process.env.RECOVERY_MODE;
  process.env.TAVILY_API_KEY = '';
  process.env.RECOVERY_MODE = 'true';

  const result = await runPipelineGates('Seth Moulton', {
    alreadyInRisingBatch: true,
  });

  assert.equal(result.passed, true);
  assert.equal(result.evidence.trending24h.passed, true);

  process.env.TAVILY_API_KEY = prevTavily;
  process.env.RECOVERY_MODE = prevRecovery;
});

test('recovery tier B with spike context still fails without rising batch', async () => {
  const prevRecovery = process.env.RECOVERY_MODE;
  process.env.RECOVERY_MODE = 'true';
  process.env.TAVILY_API_KEY = '';

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

  process.env.RECOVERY_MODE = prevRecovery;
});
