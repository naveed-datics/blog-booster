import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/cronAuth';

// GET endpoint for image search using Tavily
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
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit')) || 1;

    if (!query.trim()) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'TAVILY_API_KEY not found in environment variables' },
        { status: 500 }
      );
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: 'basic',
        max_results: 5,
        include_images: true,
      }),
    });

    if (!response.ok) {
      let errorDetails = '';
      let errorMessage = '';
      try {
        const errorData = await response.json();
        errorDetails = errorData.error || errorData.detail || JSON.stringify(errorData);
        errorMessage = errorData.error || errorData.detail || errorDetails;
      } catch (e) {
        errorDetails = await response.text();
        errorMessage = errorDetails;
      }

      console.error('Tavily error response:', {
        status: response.status,
        statusText: response.statusText,
        details: errorDetails
      });

      return NextResponse.json(
        {
          error: 'Tavily API Error',
          message: errorMessage || `API returned ${response.status} ${response.statusText}`,
          details: errorDetails,
          isQuotaError: response.status === 429 || response.status === 432,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Tavily returns `images` as either an array of URL strings, or
    // (with include_image_descriptions) an array of {url, description}
    // objects - handle both shapes.
    const rawImages = Array.isArray(data.images) ? data.images : [];
    const normalizedImages = rawImages
      .map((img) => (typeof img === 'string' ? { url: img, description: '' } : img))
      .filter((img) => img && img.url);

    if (normalizedImages.length === 0) {
      return NextResponse.json(
        { error: 'No images found', keyword: query },
        { status: 404 }
      );
    }

    const processedImages = normalizedImages.slice(0, limit).map((image, index) => ({
      position: index + 1,
      title: image.description || 'Untitled',
      thumbnail_url: image.url,
      full_size_url: image.url,
      source: 'Tavily',
      source_url: image.url,
    }));

    const imageUrl = processedImages[0].full_size_url;

    console.log(`Image search result for "${query}":`, imageUrl);

    return NextResponse.json({
      keyword: query,
      url: imageUrl,
      images: processedImages,
    });
  } catch (error) {
    console.error('Error in image-search API:', error);

    return NextResponse.json(
      {
        error: 'Failed to search images',
        message: error.message,
        details: error.message
      },
      { status: 500 }
    );
  }
}
