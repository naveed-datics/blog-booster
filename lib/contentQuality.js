/** Maps content_quality DB values to router behavior. */

export const QUALITY = {
  GOOD: 'good',
  TEMPLATED: 'templated',
  UNKNOWN: 'unknown',
};

export function normalizeContentQuality(value) {
  const v = (value || '').toLowerCase().trim();
  if (v === QUALITY.GOOD) return QUALITY.GOOD;
  if (v === QUALITY.TEMPLATED) return QUALITY.TEMPLATED;
  return QUALITY.UNKNOWN;
}

export function actionForPublishedQuality(quality) {
  const q = normalizeContentQuality(quality);
  if (q === QUALITY.GOOD) return 'light-update';
  return 'full-rewrite';
}
