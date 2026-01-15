import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// Helper function to get rising trends using SerpAPI (equivalent to get_rising_trends)
async function getRisingTrends(searchQuery = 'religion') {
  const apiKey = process.env.SERPAPI_KEY;
  
  if (!apiKey) {
    console.error('Error: SERPAPI_KEY not found in environment variables');
    return { formatted: [], raw: [] };
  }

  const baseUrl = 'https://serpapi.com/search.json';

  try {
    const params = new URLSearchParams({
      engine: 'google_trends',
      q: searchQuery,
      data_type: 'RELATED_QUERIES',
      api_key: apiKey,
      date: 'now 4-H'
    });

    const response = await fetch(`${baseUrl}?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const relatedQueriesData = await response.json();
    console.log('Rising queries data:', relatedQueriesData);

    const formatted = [];
    const raw = [];

    if (relatedQueriesData) {
      const risingQueries = relatedQueriesData?.related_queries?.rising || [];
      console.log('Rising queries:', risingQueries);

      if (risingQueries && risingQueries.length > 0) {
        for (let idx = 0; idx < risingQueries.length; idx++) {
          const row = risingQueries[idx];
          
          // Find query/title column
          const queryValue = row.query || row.title || '';
          
          // Find value column
          const changeStr = row.value || row.extracted_value || '';
          
          // Add star if value length > 7
          const star = changeStr && changeStr.toString().length > 7 ? '*' : '';
          
          // Format: "1. query value *"
          formatted.push(`${idx + 1}. ${queryValue} ${changeStr} ${star}`.trim());
          
          // Store raw data for database
          raw.push({
            query: queryValue,
            value: changeStr.toString()
          });
        }
      } else {
        console.log('No rising queries found.');
      }
    } else {
      console.log('Failed to fetch data.');
    }

    return { formatted, raw };
  } catch (error) {
    console.error(`Error fetching trends data: ${error.message}`);
    return { formatted: [], raw: [] };
  }
}

// Helper function to search for celebrity URL (equivalent to search_celebrity_url)
async function searchCelebrityUrl(celebrity) {
  try {
    // This is a placeholder - implement your actual WordPress/URL search logic
    // For now, return a mock URL or search Google
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(celebrity)}`;
    
    // In production, you would:
    // 1. Search your WordPress database
    // 2. Search a specific website
    // 3. Use a search API
    
    // For now, return null or a placeholder
    return null;
  } catch (error) {
    console.error(`Error searching for ${celebrity}:`, error);
    return null;
  }
}

// Helper function to save trends to database
async function saveTrendsToDatabase(searchQuery, trendsResult, celebList, results, websiteId = null) {
  let savedCount = 0;
  let skippedCount = 0;
  
  try {
    if (!trendsResult.raw || trendsResult.raw.length === 0) {
      console.log('No trends to save to database');
      return { savedCount: 0, skippedCount: 0 };
    }

    console.log(`Processing ${trendsResult.raw.length} trends for saving...`);
    console.log(`CelebList length: ${celebList.length}, Results length: ${results.length}`);

    // Save each trend with its celebrity and result
    // Only save trends that have a valid celebrity name
    for (let i = 0; i < trendsResult.raw.length; i++) {
      const rawTrend = trendsResult.raw[i];
      const formattedTrend = trendsResult.formatted[i] || '';
      
      // Find corresponding celebrity and result
      const celebName = celebList[i] || null;
      const result = results[i] || {};
      
      // Only save if we have a valid celebrity name (not null, not empty, not just "religion" or country)
      const cleanCelebName = celebName && typeof celebName === 'string' ? celebName.trim() : '';
      
      // List of common words/terms that are NOT celebrity names
      const invalidTerms = [
        'main', 'true', 'what', 'who', 'where', 'when', 'why', 'how', 'which',
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
        'religion', 'jeans', 'breakout', 'info', 'news', 'article', 'blog',
        'iran', 'usa', 'uk', 'china', 'india', 'japan', 'germany', 'france',
        'spain', 'italy', 'brazil', 'russia', 'canada', 'australia', 'mexico',
        'korea', 'turkey', 'poland', 'netherlands', 'belgium', 'sweden',
        'norway', 'denmark', 'finland', 'greece', 'portugal', 'israel', 'egypt',
        'montenegro', 'indonesien', 'north korea', 'south korea', 'hong kong',
        'taiwan', 'thailand', 'vietnam', 'indonesia', 'philippines', 'malaysia',
        'singapore', 'bangladesh', 'pakistan', 'afghanistan', 'iraq', 'syria',
        'lebanon', 'jordan', 'saudi', 'uae', 'qatar', 'kuwait', 'bahrain', 'oman',
        'shakers', 'whoever', 'whatever', 'whenever', 'wherever', 'however',
        // Additional explicit non-celebrity topics
        'christianity', 'islam', 'hinduism', 'buddhism', 'judaism',
        'sikhism', 'atheism', 'agnosticism',
        'roman', 'roman empire',
        'kyrgyzstan', 'egypt major'
      ];
      
      // Check if name is valid
      const lowerName = cleanCelebName.toLowerCase();
      const isInvalid = invalidTerms.includes(lowerName) ||
        lowerName.includes('religion') ||
        lowerName.includes('jeans') ||
        lowerName.includes('breakout') ||
        lowerName.includes('true religion') ||
        lowerName.includes('what is') ||
        lowerName.includes('what religion') ||
        lowerName.includes('whoever') ||
        lowerName.includes('main religion') ||
        lowerName.length < 3; // Minimum 3 characters
      
      // Require at least two words (first + last name) to reduce generic single-word terms
      const wordCount = cleanCelebName ? cleanCelebName.split(/\s+/).length : 0;
      
      if (cleanCelebName && 
          cleanCelebName.length >= 3 &&
          !isInvalid &&
          wordCount >= 2) {
        
        try {
          await query(
            `INSERT INTO trends (search_query, trend_text, celebrity_name, trend_value, url, website_result, website_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              searchQuery,
              formattedTrend,
              cleanCelebName,
              rawTrend.value || null,
              result.URL || null,
              result.website_result || null,
              websiteId || null
            ]
          );
          savedCount++;
          console.log(`✅ Saved trend: ${cleanCelebName}`);
        } catch (insertError) {
          console.error(`Error inserting trend ${i}:`, insertError);
          skippedCount++;
        }
      } else {
        skippedCount++;
        const reason = !cleanCelebName ? 'empty name' : 
                      cleanCelebName.length < 3 ? 'too short' :
                      invalidTerms.includes(lowerName) ? 'invalid term' :
                      'contains invalid words';
        console.log(`⏭️ Skipping non-celebrity trend ${i}: ${formattedTrend} (celebName: ${celebName}, reason: ${reason})`);
      }
    }
    
    console.log(`✅ Saved ${savedCount} trends to database, skipped ${skippedCount}`);
    return { savedCount, skippedCount };
  } catch (error) {
    console.error('Error saving trends to database:', error);
    return { savedCount, skippedCount };
  }
}

// Helper function to extract celebrity names using Azure OpenAI
async function extractCelebrities(trendsResult) {
  // Get Azure OpenAI configuration
  let azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  let azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  let azureDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  let azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';

  // Remove quotes if present (common in .env files)
  if (azureApiKey) azureApiKey = azureApiKey.replace(/^["']|["']$/g, '');
  if (azureEndpoint) azureEndpoint = azureEndpoint.replace(/^["']|["']$/g, '');
  if (azureDeploymentName) azureDeploymentName = azureDeploymentName.replace(/^["']|["']$/g, '');
  if (azureApiVersion) azureApiVersion = azureApiVersion.replace(/^["']|["']$/g, '');

  if (!azureApiKey || !azureEndpoint || !azureDeploymentName) {
    console.warn('Azure OpenAI not configured, extracting names manually');
    // Fallback: extract query part from formatted strings
    return extractNamesFromTrends(trendsResult.formatted);
  }

  try {
    const endpoint = azureEndpoint.replace(/\/$/, '');
    const azureUrl = `${endpoint}/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion}`;

    const systemPrompt = `You are a celebrity-name extraction assistant.

You receive a list of trending search terms (for example: "1. Emil Bove +5000% *").
Your job is to return ONLY names of INDIVIDUAL PEOPLE (celebrities).

DEFINITIONS:
- Celebrity = a specific human individual or stage name (actor, musician, athlete, politician, influencer, etc.).
- NOT allowed: countries, cities, regions, religions, languages, brands, products, TV shows, movies, games, generic topics.

STRICT RULES:
- Return ONLY a valid JSON array, exactly like: ["Brahim Diaz", "Taylor Swift", null, ...]
- For each input item:
  - If it clearly refers to a person, return the cleaned full name.
  - If it is a country (e.g. "Kyrgyzstan"), religion ("Christianity", "Hinduism"), place, generic term, or you are unsure, return null.
- NEVER return:
  - Country or region names (e.g. "Kyrgyzstan", "Romania").
  - Religions ("Christianity", "Islam", "Hinduism", "Buddhism", "Judaism", etc.).
  - Generic words like "religion", "Roman", "Christianity vs Islam", "AI jeans", etc.
- From strings like "1. emil bove religion +5000% *":
  - Extract only "Emil Bove".
- If you cannot confidently identify a human person, return null for that entry.

IMPORTANT:
- Output ONLY the JSON array, with no explanations, no code blocks, no backticks, no outer quotes.`;

    const userPrompt = `Analyze these trending search terms and extract celebrity names:\n${JSON.stringify(trendsResult.formatted)}`;

    console.log('Using Azure OpenAI for celebrity extraction');

    const response = await fetch(azureUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': azureApiKey
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.3,
        top_p: 0.9
      })
    });

    if (!response.ok) {
      let errorMessage = `Azure OpenAI API error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = `Azure OpenAI API error: ${errorData.error?.message || errorData.error?.code || response.statusText}`;
        console.error('Azure OpenAI error details:', errorData);
      } catch (e) {
        const errorText = await response.text();
        console.error('Azure OpenAI error response:', errorText);
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    let celebs = data.choices[0]?.message?.content?.trim() || '';

    console.log('Azure OpenAI Raw Response:', celebs);

    // Clean up the response
    if (celebs.startsWith('"') && celebs.endsWith('"')) {
      celebs = celebs.slice(1, -1);
    }
    
    // Remove markdown code blocks if present
    celebs = celebs.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Remove any leading/trailing whitespace and newlines
    celebs = celebs.trim();

    try {
      const celebList = JSON.parse(celebs);
      console.log('Parsed CelebList from LLM:', celebList);
      
      if (Array.isArray(celebList)) {
        // Check if all are null - if so, use fallback
        const allNull = celebList.every(name => !name || name === null || name === '');
        if (allNull) {
          console.log('LLM returned all nulls, using fallback extraction');
          return extractNamesFromTrends(trendsResult.formatted);
        }
        
        // List of invalid terms that are NOT celebrity names
        const invalidTerms = [
          'main', 'true', 'what', 'who', 'where', 'when', 'why', 'how', 'which',
          'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
          'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
          'religion', 'jeans', 'breakout', 'info', 'news', 'article', 'blog',
          'iran', 'usa', 'uk', 'china', 'india', 'japan', 'germany', 'france',
          'spain', 'italy', 'brazil', 'russia', 'canada', 'australia', 'mexico',
          'korea', 'turkey', 'poland', 'netherlands', 'belgium', 'sweden',
          'norway', 'denmark', 'finland', 'greece', 'portugal', 'israel', 'egypt',
          'montenegro', 'indonesien', 'north korea', 'south korea', 'hong kong',
          'taiwan', 'thailand', 'vietnam', 'indonesia', 'philippines', 'malaysia',
          'singapore', 'bangladesh', 'pakistan', 'afghanistan', 'iraq', 'syria',
          'lebanon', 'jordan', 'saudi', 'uae', 'qatar', 'kuwait', 'bahrain', 'oman',
          'shakers', 'whoever', 'whatever', 'whenever', 'wherever', 'however',
          // Additional explicit non-celebrity topics
          'christianity', 'islam', 'hinduism', 'buddhism', 'judaism',
          'sikhism', 'atheism', 'agnosticism',
          'roman', 'roman empire',
          'kyrgyzstan', 'egypt major'
        ];
        
        // Filter out null, empty strings, and non-celebrity terms
        // But keep the array length the same to match with trends
        const processed = celebList.map(name => {
          if (!name || typeof name !== 'string') return null;
          const cleanName = name.trim();
          
          // Minimum length check
          if (cleanName.length < 3) return null;
          
          // Filter out obvious non-celebrities
          const lowerName = cleanName.toLowerCase();
          const isInvalid = invalidTerms.includes(lowerName) ||
            lowerName.includes('religion') || 
            lowerName.includes('jeans') || 
            lowerName.includes('breakout') ||
            lowerName.includes('true religion') ||
            lowerName.includes('what is') ||
            lowerName.includes('what religion') ||
            lowerName.includes('main religion') ||
            lowerName.includes('whoever');
          
          if (isInvalid) {
            return null;
          }

          // Require at least two words (first + last name) to reduce generic single-word terms
          const wordCount = cleanName.split(/\s+/).length;
          if (wordCount < 2) {
            return null;
          }
          
          return cleanName;
        });
        
        // If most are null (>80%), use fallback
        const nullCount = processed.filter(n => !n).length;
        if (nullCount > processed.length * 0.8) {
          console.log(`Too many nulls from LLM (${nullCount}/${processed.length}), using fallback extraction`);
          return extractNamesFromTrends(trendsResult.formatted);
        }
        
        console.log('Processed CelebList:', processed);
        return processed;
      }
    } catch (parseError) {
      console.error('Error parsing celebrity list:', parseError);
      console.log('Raw response:', celebs);
      // Fallback: try to extract names from trend text
      return extractNamesFromTrends(trendsResult.formatted);
    }

    // Fallback: try to extract names from trend text
    return extractNamesFromTrends(trendsResult.formatted);
  } catch (error) {
    console.error('Error extracting celebrities:', error);
    // Fallback: try to extract names from trend text
    return extractNamesFromTrends(trendsResult.formatted);
  }
}

// Fallback function to extract celebrity names from trend text
function extractNamesFromTrends(formattedTrends) {
  const extracted = [];
  
  for (const trend of formattedTrends) {
    // Extract query from format "1. query value *" or "1. celebrity name religion +X%"
    const match = trend.match(/^\d+\.\s+(.+?)(?:\s+(?:religion|Breakout|\+|\*|%))/i);
    if (match) {
      let name = match[1].trim();
      
      // Remove common non-celebrity patterns
      if (name.toLowerCase().includes('what religion is')) {
        name = name.replace(/what religion is\s+/i, '').trim();
      }
      if (name.toLowerCase().includes('religion')) {
        name = name.replace(/\s+religion.*$/i, '').trim();
      }
      
      // Filter out countries, products, etc.
      const lowerName = name.toLowerCase();
      if (lowerName.includes('jeans') || 
          lowerName.includes('true religion') ||
          lowerName.includes('breakout') ||
          ['montenegro', 'indonesien', 'north korea', 'china', 'iran', 'usa'].includes(lowerName) ||
          lowerName.includes('what is') ||
          lowerName.includes('whoever') ||
          lowerName.includes('shakers')) {
        extracted.push(null);
      } else if (name && name.length > 2) {
        // Capitalize properly
        const words = name.split(' ');
        const capitalized = words.map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        extracted.push(capitalized);
      } else {
        extracted.push(null);
      }
    } else {
      extracted.push(null);
    }
  }
  
  console.log('Extracted names from trends:', extracted);
  return extracted;
}

export async function GET(request) {
  try {
    // Check authentication
    const { auth } = await import('@/lib/auth');
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || 'religion';
    const websiteId = searchParams.get('website_id') ? parseInt(searchParams.get('website_id')) : null;

    // Get rising trends
    const trendsResult = await getRisingTrends(query);
    console.log('Rising Trends:', trendsResult);

    // Extract celebrities using Gemini
    const celebList = await extractCelebrities(trendsResult);
    
    // Ensure celebList matches the length of trendsResult.raw
    // Pad with null if needed
    while (celebList.length < trendsResult.raw.length) {
      celebList.push(null);
    }
    // Trim if too long
    if (celebList.length > trendsResult.raw.length) {
      celebList.splice(trendsResult.raw.length);
    }

    // Search for WordPress posts/URLs for each celebrity
    // Create results array that matches trendsResult.raw length
    const results = [];
    for (let i = 0; i < trendsResult.raw.length; i++) {
      const celeb = celebList[i];
      if (celeb) {
        const wpResult = await searchCelebrityUrl(celeb);
        
        if (wpResult) {
          results.push({
            celebrity: celeb,
            Title: celeb,
            URL: wpResult
          });
        } else {
          results.push({
            celebrity: celeb,
            website_result: 'no data'
          });
        }

        console.log(`WordPress result for ${celeb}:`, wpResult);
      } else {
        // Add empty result for null celebrity
        results.push({
          celebrity: null,
          website_result: 'no data'
        });
      }
    }

    // Save trends to database (ensure this completes before returning)
    let savedCount = 0;
    let skippedCount = 0;
    try {
      const saveResult = await saveTrendsToDatabase(query, trendsResult, celebList, results, websiteId);
      savedCount = saveResult?.savedCount || 0;
      skippedCount = saveResult?.skippedCount || 0;
      console.log(`✅ Successfully saved ${savedCount} trends to database (skipped ${skippedCount})`);
    } catch (saveError) {
      console.error('Error saving trends (non-fatal):', saveError);
      // Continue even if save fails
    }

    // Note: Google Sheets append functionality would go here if needed
    // append_to_sheet(1, [JSON.stringify(celebList), JSON.stringify(results)]);

    return NextResponse.json({
      trends_result: celebList,
      results: results,
      saved_to_db: savedCount > 0,
      saved_count: savedCount,
      skipped_count: skippedCount,
      total_trends: trendsResult.raw?.length || 0
    });
  } catch (error) {
    console.error('Error in trend-search API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trends', details: error.message },
      { status: 500 }
    );
  }
}

