/**
 * Set Auth.js / app URL defaults on Vercel when explicit env vars are missing.
 * VERCEL_URL is injected automatically by Vercel (hostname only, no protocol).
 */
export function ensureVercelEnvDefaults() {
  if (!process.env.AUTH_URL && !process.env.NEXTAUTH_URL && process.env.VERCEL_URL) {
    process.env.AUTH_URL = `https://${process.env.VERCEL_URL}`;
  }

  if (!process.env.NEXT_PUBLIC_BASE_URL && process.env.VERCEL_URL) {
    process.env.NEXT_PUBLIC_BASE_URL = `https://${process.env.VERCEL_URL}`;
  }
}

/**
 * Resolve Auth.js secret from supported env var names (v5 + legacy v4).
 */
export function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
}
