import cron from 'node-cron';

let cronJob = null;
let isInitialized = false;

/**
 * Initialize the cron job for automatic trend fetching
 * This runs every minute and checks if any websites need trend fetching
 */
export function initializeCronJob() {
  // Prevent multiple initializations
  if (isInitialized && cronJob) {
    console.log('[Cron] Cron job already initialized, skipping...');
    return;
  }

  // Only run in production or when explicitly enabled
  const isDevelopment = process.env.NODE_ENV === 'development';
  const cronEnabled = process.env.CRON_ENABLED !== 'false'; // Enabled by default

  if (!cronEnabled && !isDevelopment) {
    console.log('[Cron] Cron job is disabled (set CRON_ENABLED=false to disable)');
    return;
  }

  console.log('[Cron] Initializing automatic trend fetching cron job...');

  // Get base URL for API calls
  let baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) {
    if (process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    } else {
      baseUrl = 'http://localhost:3003';
    }
  }

  // Schedule job to run every minute
  // Cron expression: "* * * * *" means every minute
  cronJob = cron.schedule('* * * * *', async () => {
    try {
      const cronEndpoint = `${baseUrl}/api/cron/fetch-trends`;
      
      console.log(`[Cron] ⏰ Running scheduled check at ${new Date().toISOString()}`);
      
      // For serverless environments, use AbortSignal if available, otherwise use a timeout
      const timeout = 30000; // 30 seconds
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller 
        ? setTimeout(() => controller.abort(), timeout)
        : null;

      // Call the cron API endpoint
      const fetchOptions = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // Add authorization header if CRON_SECRET is set
          ...(process.env.CRON_SECRET && {
            'Authorization': `Bearer ${process.env.CRON_SECRET}`,
          }),
        },
        ...(controller && { signal: controller.signal }),
      };

      const response = await fetch(cronEndpoint, fetchOptions);

      if (timeoutId) clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.triggered > 0) {
          console.log(`[Cron] ✅ Triggered ${data.triggered} trend fetch(es) successfully`);
          if (data.results?.triggered) {
            data.results.triggered.forEach((result) => {
              console.log(`  - Website ${result.website_id} (${result.website_name}): ${result.result?.saved_count || 0} trends saved`);
            });
          }
        } else {
          console.log(`[Cron] ⏸️  No websites matched scheduled time (checked ${data.checked || 0} websites)`);
        }
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[Cron] ❌ Cron endpoint returned error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
      }
    } catch (error) {
      // Don't throw - we want the cron to continue running even if one check fails
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        console.error('[Cron] ❌ Cron check timed out after 30 seconds');
      } else {
        console.error('[Cron] ❌ Error in cron job:', error.message);
      }
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Karachi', // Pakistan Time (PKT)
  });

  isInitialized = true;
  console.log('[Cron] ✅ Automatic trend fetching cron job initialized (runs every minute)');
  console.log(`[Cron] Base URL: ${baseUrl}`);
}

/**
 * Stop the cron job
 */
export function stopCronJob() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    isInitialized = false;
    console.log('[Cron] Cron job stopped');
  }
}

/**
 * Get cron job status
 */
export function getCronStatus() {
  return {
    initialized: isInitialized,
    running: cronJob !== null,
  };
}

