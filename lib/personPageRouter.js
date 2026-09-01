import { PIPELINE_ACTIONS } from './pipelineConfig.js';
import { actionForPublishedQuality } from './contentQuality.js';

/**
 * Resolve pipeline action from lookupPerson result + optional trend context.
 */
export function resolveAction(lookup, trendContext = {}) {
  if (!lookup) {
    return { action: PIPELINE_ACTIONS.CREATE_NEW, reason: 'no lookup' };
  }

  if (lookup.match === 'duplicate_slugs') {
    return {
      action: PIPELINE_ACTIONS.CONSOLIDATE,
      reason: 'duplicate slug pair detected',
      canonical: lookup.canonical,
      duplicate: lookup.duplicate,
    };
  }

  if (lookup.match === 'none') {
    return { action: PIPELINE_ACTIONS.CREATE_NEW, reason: 'no existing page' };
  }

  if (lookup.match === 'draft' || lookup.status === 'draft') {
    return {
      action: PIPELINE_ACTIONS.REVIVE_DRAFT,
      reason: 'existing draft — full rewrite before publish',
      postId: lookup.postId,
    };
  }

  if (lookup.match === 'published' || lookup.status === 'publish') {
    const action = actionForPublishedQuality(lookup.contentQuality);
    return {
      action,
      reason: `published page content_quality=${lookup.contentQuality || 'unknown'}`,
      postId: lookup.postId,
    };
  }

  if (lookup.postId) {
    const action = actionForPublishedQuality(lookup.contentQuality);
    return { action, reason: 'existing post_id', postId: lookup.postId };
  }

  return { action: PIPELINE_ACTIONS.CREATE_NEW, reason: 'fallback create-new' };
}

export function shouldRunCreateNewGates(resolved) {
  return resolved.action === PIPELINE_ACTIONS.CREATE_NEW;
}
