import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { auth } from '@/lib/auth';

// Helper function to validate if a name is a celebrity using LLM
async function validateCelebrityName(name) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  
  if (!apiKey || !name || name.trim() === '') {
    return false;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are a helpful assistant. Analyze the following name and determine if it is a celebrity name (actor, musician, athlete, public figure, etc.). 

Name: "${name}"

Return ONLY "true" if it is a celebrity name, or "false" if it is not (e.g., country name, religion, product, generic term, etc.). Do not include any explanations or additional text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim().toLowerCase();
    
    return text === 'true' || text === 'yes';
  } catch (error) {
    console.error('Error validating celebrity name:', error);
    // If LLM validation fails, return true to keep the name (fail open)
    return true;
  }
}

// GET endpoint to fetch saved trends from database
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
    const searchQuery = searchParams.get('search_query');
    const limit = parseInt(searchParams.get('limit')) || 100;
    const offset = parseInt(searchParams.get('offset')) || 0;
    const dateFilter = searchParams.get('date'); // Format: YYYY-MM-DD (currently unused – we always return all dates)
    const websiteId = searchParams.get('website_id') ? parseInt(searchParams.get('website_id')) : null;
    const niche = searchParams.get('niche'); // Website niche for filtering

    let sql = `
      SELECT 
        id,
        search_query,
        trend_text,
        celebrity_name,
        trend_value,
        url,
        website_result,
        created_at,
        updated_at,
        DATE(created_at) as trend_date
      FROM trends
      WHERE celebrity_name IS NOT NULL AND celebrity_name != ''
    `;
    const params = [];
    let paramIndex = 1;

    // Filter by website_id OR niche if provided (for AI Dashboard)
    // Show trends that match either the website_id OR the niche (search_query)
    // This allows showing trends associated with the website OR trends matching the niche
    if (websiteId || niche) {
      const conditions = [];
      if (websiteId) {
        // Match by website_id
        conditions.push(`website_id = $${paramIndex}`);
        params.push(websiteId);
        paramIndex++;
      }
      if (niche) {
        // Match by niche in a flexible way:
        // - We want to include older trends where search_query might be a simple term
        //   like "religion" while the website niche is "Religion info".
        // - To support this, we check if the provided niche string CONTAINS the
        //   stored search_query (case-insensitive), e.g. 'Religion info' ILIKE
        //   '%' || search_query || '%'.
        // This handles:
        //   - New trends where search_query === website.niche
        //   - Old trends where search_query is a simpler keyword that appears in the niche
        conditions.push(`$${paramIndex} ILIKE '%' || search_query || '%'`);
        params.push(niche);
        paramIndex++;
      }
      if (conditions.length > 0) {
        // Show trends that match EITHER website_id OR niche
        sql += ` AND (${conditions.join(' OR ')})`;
      }
    }
    
    console.log('Trends API Query:', {
      websiteId,
      niche,
      dateFilter,
      searchQuery,
      sql: sql.substring(0, 200) + '...',
      paramsCount: params.length
    });

    if (searchQuery) {
      sql += ` AND search_query ILIKE $${paramIndex}`;
      params.push(`%${searchQuery}%`);
      paramIndex++;
    }

    // Apply date filter if provided
    if (dateFilter) {
      sql += ` AND DATE(created_at) = $${paramIndex}`;
      params.push(dateFilter);
      paramIndex++;
    } else {
      // NOTE: If no dateFilter is provided, we intentionally do NOT filter by a specific date.
      // This allows the full trending list (all available dates) to be displayed by default.
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    console.log(`Trends API: Found ${result.rows.length} trends before filtering`);

    // Filter out obvious non-celebrities (countries, products, etc.)
    let filteredRows = result.rows.filter(row => {
      if (!row.celebrity_name) return false;
      const name = row.celebrity_name.toLowerCase().trim();
      
      // Filter out countries
      const countries = ['iran', 'usa', 'uk', 'china', 'india', 'japan', 'germany', 'france', 'spain', 'italy', 'brazil', 'russia', 'canada', 'australia', 'mexico', 'korea', 'turkey', 'poland', 'netherlands', 'belgium', 'sweden', 'norway', 'denmark', 'finland', 'greece', 'portugal', 'israel', 'egypt', 'saudi', 'uae', 'qatar', 'kuwait', 'bahrain', 'oman', 'jordan', 'lebanon', 'syria', 'iraq', 'afghanistan', 'pakistan', 'bangladesh', 'sri lanka', 'thailand', 'vietnam', 'indonesia', 'philippines', 'malaysia', 'singapore', 'hong kong', 'taiwan'];
      if (countries.includes(name)) return false;
      
      // Filter out products/brands
      if (name.includes('jeans') || name.includes('brand') || name.includes('product')) return false;
      
      // Filter out websites/domains
      if (name.includes('.com') || name.includes('.org') || name.includes('www') || name.includes('http')) return false;
      
      // Filter out if it contains "religion" as a standalone word (not part of a name)
      if (name.includes(' religion') || name.endsWith(' religion') || name === 'religion') return false;
      
      // Filter out if it contains trend values/percentages
      if (name.includes('+') || name.includes('%') || name.includes('breakout')) return false;
      
      // Filter out generic terms
      const genericTerms = ['infocatolica', 'info', 'news', 'article', 'blog', 'website'];
      if (genericTerms.some(term => name.includes(term))) return false;
      
      return true;
    });

    // Optional: Further filter using LLM validation if needed
    // This can be enabled via query parameter ?validate=true
    const validate = searchParams.get('validate') === 'true';
    
    if (validate) {
      const validationPromises = filteredRows.map(async (row) => {
        const isValid = await validateCelebrityName(row.celebrity_name);
        return isValid ? row : null;
      });
      
      const validatedRows = await Promise.all(validationPromises);
      filteredRows = validatedRows.filter(row => row !== null);
    }

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM trends WHERE celebrity_name IS NOT NULL AND celebrity_name != \'\'';
    const countParams = [];
    let countParamIndex = 1;
    
    // Apply same filtering logic as main query
    if (websiteId || niche) {
      const conditions = [];
      if (websiteId) {
        conditions.push(`website_id = $${countParamIndex}`);
        countParams.push(websiteId);
        countParamIndex++;
      }
      if (niche) {
        // Apply the same flexible niche matching logic as in the main query
        conditions.push(`$${countParamIndex} ILIKE '%' || search_query || '%'`);
        countParams.push(niche);
        countParamIndex++;
      }
      if (conditions.length > 0) {
        countSql += ` AND (${conditions.join(' OR ')})`;
      }
    }
    
    if (searchQuery) {
      countSql += ` AND search_query ILIKE $${countParamIndex}`;
      countParams.push(`%${searchQuery}%`);
      countParamIndex++;
    }
    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0]?.total || 0);

    // Get available dates for trends (filtered by website_id or niche if provided)
    let datesSql = `SELECT DISTINCT DATE(created_at) as trend_date 
       FROM trends 
       WHERE celebrity_name IS NOT NULL AND celebrity_name != ''`;
    const datesParams = [];
    let datesParamIndex = 1;
    
    if (websiteId || niche) {
      const conditions = [];
      if (websiteId) {
        conditions.push(`website_id = $${datesParamIndex}`);
        datesParams.push(websiteId);
        datesParamIndex++;
      }
      if (niche) {
        // Apply the same flexible niche matching logic as in the main query
        conditions.push(`$${datesParamIndex} ILIKE '%' || search_query || '%'`);
        datesParams.push(niche);
        datesParamIndex++;
      }
      if (conditions.length > 0) {
        datesSql += ` AND (${conditions.join(' OR ')})`;
      }
    }
    datesSql += ` ORDER BY trend_date DESC`;
    const datesResult = await query(datesSql, datesParams);
    const availableDates = datesResult.rows.map(row => row.trend_date);

    console.log(`Trends API: Returning ${filteredRows.length} filtered trends (total: ${total})`);

    return NextResponse.json({
      trends: filteredRows,
      total,
      limit,
      offset,
      validated: validate,
      availableDates
    });
  } catch (error) {
    console.error('Error fetching trends from database:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trends', details: error.message },
      { status: 500 }
    );
  }
}
