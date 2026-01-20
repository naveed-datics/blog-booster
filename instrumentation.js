/**
 * Next.js Instrumentation Hook
 * This file runs once when the server starts (in serverless, it runs per instance)
 * Used to initialize cron jobs and other server-side tasks
 */
export async function register() {
  // Only run on server (not in Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Initializing server-side services...');
    
    // Initialize cron job for automatic trend fetching
    try {
      const { initializeCronJob } = await import('./lib/cron.js');
      initializeCronJob();
      console.log('[Instrumentation] ✅ Cron job initialization started');
    } catch (error) {
      console.error('[Instrumentation] ❌ Failed to initialize cron job:', error);
    }
  }
}

