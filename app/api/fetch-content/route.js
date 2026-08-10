import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/cronAuth';

// POST endpoint to fetch content from multiple URLs
export async function POST(request) {
  try {
    // Check authentication
    if (!(await isAuthorized(request))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { urls } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: 'URLs array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Limit to maximum 3 URLs
    if (urls.length > 3) {
      return NextResponse.json(
        { error: 'Maximum 3 URLs allowed' },
        { status: 400 }
      );
    }

    // Validate URLs
    const validUrls = [];
    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
          validUrls.push(url);
        } else {
          return NextResponse.json(
            { error: `Invalid URL protocol: ${url}. Only http:// and https:// are allowed.` },
            { status: 400 }
          );
        }
      } catch (e) {
        return NextResponse.json(
          { error: `Invalid URL format: ${url}` },
          { status: 400 }
        );
      }
    }

    // Fetch content from all URLs in parallel
    const fetchPromises = validUrls.map(async (url) => {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          // Add timeout
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        if (!response.ok) {
          return {
            url,
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            content: null,
            contentType: null,
            contentLength: 0
          };
        }

        const contentType = response.headers.get('content-type') || '';
        const content = await response.text();
        const contentLength = content.length;

        // Extract text content (basic extraction, remove scripts and styles)
        let textContent = content;
        
        // Remove script tags and their content
        textContent = textContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        
        // Remove style tags and their content
        textContent = textContent.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
        
        // Remove HTML tags but keep text
        textContent = textContent.replace(/<[^>]+>/g, ' ');
        
        // Clean up whitespace
        textContent = textContent.replace(/\s+/g, ' ').trim();
        
        // Limit content length to prevent huge responses (first 50000 characters)
        const maxLength = 50000;
        const truncatedContent = textContent.length > maxLength 
          ? textContent.substring(0, maxLength) + '... [Content truncated]'
          : textContent;

        return {
          url,
          success: true,
          content: truncatedContent,
          fullContent: content.substring(0, 100000), // Keep first 100k chars of HTML for reference
          contentType,
          contentLength: textContent.length,
          truncated: textContent.length > maxLength
        };
      } catch (error) {
        return {
          url,
          success: false,
          error: error.message || 'Failed to fetch content',
          content: null,
          contentType: null,
          contentLength: 0
        };
      }
    });

    const results = await Promise.all(fetchPromises);

    // Count successful fetches
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      totalUrls: validUrls.length,
      successCount,
      failureCount,
      results
    });
  } catch (error) {
    console.error('Error in fetch-content API:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch content', 
        message: error.message,
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// GET endpoint for testing (accepts URLs as query parameters)
export async function GET(request) {
  try {
    // Check authentication
    if (!(await isAuthorized(request))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const url1 = searchParams.get('url1');
    const url2 = searchParams.get('url2');
    const url3 = searchParams.get('url3');

    const urls = [url1, url2, url3].filter(Boolean);

    if (urls.length === 0) {
      return NextResponse.json(
        { error: 'At least one URL is required. Use url1, url2, url3 query parameters or POST with JSON body.' },
        { status: 400 }
      );
    }

    // Use POST logic
    const body = { urls };
    const mockRequest = {
      json: async () => body
    };
    
    return POST(mockRequest);
  } catch (error) {
    console.error('Error in fetch-content API (GET):', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch content', 
        message: error.message,
        details: error.message 
      },
      { status: 500 }
    );
  }
}

