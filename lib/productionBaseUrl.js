// Hardcoded on purpose - do NOT derive this from the request's host
// header, and do NOT fall back to NEXT_PUBLIC_BASE_URL. Both were tried
// and both caused real failures:
//   - host-header-derived: if this route is ever invoked via a
//     deployment-specific preview URL (which has Vercel's SSO/deployment
//     protection enabled), every internal fetch hits that SSO gate
//     instead of the real API and gets back an HTML login page, crashing
//     with "Unexpected token '<' ... is not valid JSON".
//   - NEXT_PUBLIC_BASE_URL fallback: that env var is set in this project
//     for an unrelated purpose (likely client-side use) and does not
//     point at a URL this server-side route can actually reach - using
//     it as a fallback caused every internal call to fail instantly with
//     a low-level "fetch failed" (bad host/unreachable URL), even though
//     calling the same routes directly from outside works fine.
// Cron internal calls must always hit the real production domain.
export function getCronBaseUrl() {
  return "https://blog-booster.vercel.app";
}
