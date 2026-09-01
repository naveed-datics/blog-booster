import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAction, shouldRunCreateNewGates } from './personPageRouter.js';

test('resolveAction returns create-new when no match', () => {
  const r = resolveAction({ match: 'none' });
  assert.equal(r.action, 'create-new');
});

test('resolveAction returns light-update for good published page', () => {
  const r = resolveAction({
    match: 'published',
    status: 'publish',
    contentQuality: 'good',
    postId: 3229,
  });
  assert.equal(r.action, 'light-update');
  assert.equal(r.postId, 3229);
});

test('resolveAction returns full-rewrite for templated page', () => {
  const r = resolveAction({
    match: 'published',
    contentQuality: 'templated',
    postId: 100,
  });
  assert.equal(r.action, 'full-rewrite');
});

test('resolveAction returns consolidate for duplicate_slugs', () => {
  const r = resolveAction({ match: 'duplicate_slugs', canonical: {}, duplicate: {} });
  assert.equal(r.action, 'consolidate');
});

test('shouldRunCreateNewGates only for create-new', () => {
  assert.equal(shouldRunCreateNewGates({ action: 'create-new' }), true);
  assert.equal(shouldRunCreateNewGates({ action: 'light-update' }), false);
});
