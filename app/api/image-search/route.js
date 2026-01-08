import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

// GET endpoint for image search using SerpAPI
export async function GET(request) {
  try {
    // Check authentication
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const size = searchParams.get('size') || 'l'; // l=large, m=medium, 2mp=2MP+, 4mp=4MP+
    const imageType = searchParams.get('image_type') || '';
    const color = searchParams.get('color') || '';
    const limit = parseInt(searchParams.get('limit')) || 1;

    if (!query.trim()) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.SERPAPI_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'SERPAPI_KEY not found in environment variables' },
        { status: 500 }
      );
    }

    // Append " Youtube" to the keyword
    const keyword = `${query} Youtube`;

    // Build parameters
    const params = new URLSearchParams({
      engine: 'google_images',
      q: keyword,
      api_key: apiKey,
    });

    // Add optional parameters
    if (size) {
      params.append('imgsz', size);
    }
    if (imageType) {
      params.append('image_type', imageType);
    }
    if (color) {
      params.append('image_color', color);
    }
    if (limit && limit >= 1 && limit <= 100) {
      params.append('num', limit.toString());
    }

    // Make request to SerpAPI
    const baseUrl = 'https://serpapi.com/search.json';
    const response = await fetch(`${baseUrl}?${params.toString()}`);

    if (!response.ok) {
      // Try to get error details from response
      let errorDetails = '';
      let errorMessage = '';
      try {
        const errorData = await response.json();
        errorDetails = errorData.error || errorData.message || JSON.stringify(errorData);
        errorMessage = errorData.error || errorData.message || errorDetails;
      } catch (e) {
        errorDetails = await response.text();
        errorMessage = errorDetails;
      }
      
      console.error('SerpAPI error response:', {
        status: response.status,
        statusText: response.statusText,
        details: errorDetails
      });

      // Handle specific error cases
      if (errorMessage.toLowerCase().includes('not enough credits') || 
          errorMessage.toLowerCase().includes('insufficient credits') ||
          errorMessage.toLowerCase().includes('invalid api key')) {
        return NextResponse.json(
          { 
            error: 'API Error', 
            message: errorMessage || 'The SerpAPI account has an issue. Please check your API key and credits.',
            details: errorDetails
          },
          { status: 402 } // 402 Payment Required
        );
      }

      return NextResponse.json(
        { 
          error: 'SerpAPI Error', 
          message: errorMessage || `API returned ${response.status} ${response.statusText}`,
          details: errorDetails
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('SerpAPI results:', JSON.stringify(data, null, 2));

    // Check for error in response
    if (data.error) {
      return NextResponse.json(
        { 
          error: 'API Error', 
          message: data.error,
          details: data.error
        },
        { status: 400 }
      );
    }

    // Get images_results array
    const imagesResults = data.images_results || [];

    if (!Array.isArray(imagesResults) || imagesResults.length === 0) {
      return NextResponse.json(
        { error: 'No images found', keyword, availableKeys: Object.keys(data) },
        { status: 404 }
      );
    }

    // Process results (limit to requested number)
    const processedImages = imagesResults.slice(0, limit).map((image, index) => ({
      position: index + 1,
      title: image.title || 'Untitled',
      thumbnail_url: image.thumbnail || '',
      full_size_url: image.original || '',
      dimensions: `${image.original_width || 0}x${image.original_height || 0}`,
      original_width: image.original_width || 0,
      original_height: image.original_height || 0,
      source: image.source || 'Unknown',
      source_url: image.link || '',
      is_product: image.is_product || false
    }));

    // Return first image URL (matching Python function behavior)
    const firstImage = processedImages[0];
    const imageUrl = firstImage.full_size_url;

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL not found in results', keyword, results: firstImage },
        { status: 404 }
      );
    }

    console.log(`Image search result for "${keyword}":`, imageUrl);

    return NextResponse.json({
      keyword: query, // Return original query, not with "Youtube"
      url: imageUrl,
      // Optionally return all processed images
      images: processedImages
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

