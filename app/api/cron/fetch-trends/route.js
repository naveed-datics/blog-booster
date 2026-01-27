import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Server-side cron endpoint to check and trigger trend fetching
 * This runs automatically every minute when called by node-cron
 * Checks all websites with auto_mode = true and triggers fetching at scheduled times
 */
export async function GET(request) {
  try {
    // Optional: Add API key protection for cron endpoint
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'your-cron-secret-key';
    
    // In production, you might want to protect this endpoint
    // For now, we'll allow it but log the request
    console.log('[Cron] Checking for scheduled trend fetches...');

    // Get all websites with auto_mode enabled and fetching_times set
    const websitesResult = await query(
      `SELECT 
        id, 
        niche, 
        fetching_times,
        auto_mode,
        website_name
      FROM websites 
      WHERE auto_mode = true 
        AND fetching_times IS NOT NULL 
        AND fetching_times != ''
        AND niche IS NOT NULL
        AND niche != ''
        AND is_active = true
      ORDER BY id ASC`,
      []
    );

    if (websitesResult.rows.length === 0) {
      console.log('[Cron] No websites with auto_mode enabled found.');
      return NextResponse.json({
        success: true,
        message: 'No websites with auto_mode enabled',
        triggered: 0,
        checked: 0,
      });
    }

    console.log(`[Cron] Found ${websitesResult.rows.length} websites with auto_mode enabled`);

    // Get current time in Pakistan Time (UTC +5)
    const now = new Date();
    const pktTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const hours = pktTime.getUTCHours();
    const minutes = pktTime.getUTCMinutes();
    const seconds = pktTime.getUTCSeconds();

    // For Vercel Cron (runs at specific intervals), we don't check seconds
    // The seconds check is only needed for node-cron which runs every second
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    
    if (!isVercelCron && seconds > 30) {
      // Only skip for non-Vercel cron calls (e.g., node-cron running every minute)
      console.log(`[Cron] Skipping check - not at start of minute (seconds: ${seconds})`);
      return NextResponse.json({
        success: true,
        message: 'Not at scheduled trigger time',
        triggered: 0,
        checked: websitesResult.rows.length,
      });
    }

    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;

    // Multiple time formats for matching
    const currentHHMM_AMPM = `${h12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    const currentHMM_AMPM = `${h12}:${minutes.toString().padStart(2, '0')}${ampm}`;
    const currentH_AMPM = `${h12}${ampm}`;
    const currentHH_AMPM = `${h12.toString().padStart(2, '0')}${ampm}`;
    
    // For Vercel Cron (hourly), also match any time within the current hour
    // e.g., if cron runs at 6:00 PM and website has "6:33PM", trigger it
    const currentHourFormats = [
      `${h12}${ampm}`,           // "6PM"
      `${h12.toString().padStart(2, '0')}${ampm}`, // "06PM"
    ];

    const triggered = [];
    const skipped = [];

    // Check each website
    for (const website of websitesResult.rows) {
      const fetchingTimes = website.fetching_times
        .split(',')
        .map((t) => t.trim().toUpperCase());

      // Check if current time matches any scheduled time
      const isMatch = fetchingTimes.some((time) => {
        const normalizedInput = time.replace(/\s+/g, '').toUpperCase();
        
        // Exact minute match (for node-cron running every minute)
        const exactMatch = (
          normalizedInput === currentHHMM_AMPM.replace(/\s+/g, '') ||
          normalizedInput === currentHMM_AMPM
        );
        
        // Hour-only match (e.g., "6PM", "06PM")
        const hourOnlyMatch = currentHourFormats.some(fmt => normalizedInput === fmt);
        
        // For Vercel Cron (hourly), also match times within current hour
        // e.g., if time is "6:33PM" and current hour is 6PM, match it
        let hourRangeMatch = false;
        if (isVercelCron) {
          // Extract hour from the scheduled time (e.g., "6:33PM" -> 6, "PM")
          const timeMatch = normalizedInput.match(/^(\d{1,2}):?(\d{2})?(AM|PM)$/i);
          if (timeMatch) {
            const scheduledHour = parseInt(timeMatch[1]);
            const scheduledAmPm = timeMatch[3].toUpperCase();
            // Check if the scheduled hour matches current hour
            hourRangeMatch = (scheduledHour === h12 && scheduledAmPm === ampm);
          }
        }
        
        return exactMatch || hourOnlyMatch || hourRangeMatch;
      });

      if (isMatch) {
        console.log(`[Cron] ⏰ Time match found for website ${website.id} (${website.website_name || 'N/A'}) at ${currentHHMM_AMPM} PKT`);
        
        try {
          // Get base URL from request headers or environment
          const host = request.headers.get('host');
          const protocol = request.headers.get('x-forwarded-proto') || 'https';
          let baseUrl;
          if (host) {
            baseUrl = `${protocol}://${host}`;
          } else if (process.env.NEXT_PUBLIC_BASE_URL) {
            baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
          } else if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
            baseUrl = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
          } else if (process.env.VERCEL_URL) {
            baseUrl = `https://${process.env.VERCEL_URL}`;
          } else {
            baseUrl = `http://localhost:${process.env.PORT || 3000}`;
          }

          // Call trend-search API internally
          const trendSearchUrl = `${baseUrl}/api/trend-search?q=${encodeURIComponent(website.niche)}&website_id=${website.id}`;
          
          console.log(`[Cron] 🔄 Triggering trend fetch for website ${website.id}: ${trendSearchUrl}`);
          
          // For internal API calls, add header to bypass authentication
          const response = await fetch(trendSearchUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-cron': 'true', // This tells trend-search to bypass authentication
            },
          });

          if (response.ok) {
            const data = await response.json();
            triggered.push({
              website_id: website.id,
              website_name: website.website_name,
              niche: website.niche,
              scheduled_time: currentHHMM_AMPM,
              result: {
                saved_count: data.saved_count || 0,
                skipped_count: data.skipped_count || 0,
              },
            });
            console.log(`[Cron] ✅ Successfully triggered trends fetch for website ${website.id}: ${data.saved_count || 0} trends saved`);
          } else {
            const errorText = await response.text();
            console.error(`[Cron] ❌ Failed to trigger trends fetch for website ${website.id}: ${response.status} - ${errorText}`);
            skipped.push({
              website_id: website.id,
              website_name: website.website_name,
              error: `HTTP ${response.status}: ${errorText.substring(0, 100)}`,
            });
          }
        } catch (error) {
          console.error(`[Cron] ❌ Error triggering trends fetch for website ${website.id}:`, error.message);
          skipped.push({
            website_id: website.id,
            website_name: website.website_name,
            error: error.message,
          });
        }

        // Add a small delay between websites to avoid overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        skipped.push({
          website_id: website.id,
          website_name: website.website_name,
          reason: 'Time not matched',
          scheduled_times: fetchingTimes,
          current_time: currentHHMM_AMPM,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Cron check completed',
      triggered: triggered.length,
      skipped: skipped.length,
      checked: websitesResult.rows.length,
      current_time: currentHHMM_AMPM,
      results: {
        triggered,
        skipped,
      },
    });
  } catch (error) {
    console.error('[Cron] Error in cron fetch-trends:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process cron job',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

