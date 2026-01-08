import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
    const dateFilter = searchParams.get('date'); // Format: YYYY-MM-DD

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

    if (searchQuery) {
      sql += ` AND search_query ILIKE $${paramIndex}`;
      params.push(`%${searchQuery}%`);
      paramIndex++;
    }

    // Filter by specific date if provided
    if (dateFilter) {
      sql += ` AND DATE(created_at) = $${paramIndex}`;
      params.push(dateFilter);
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

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
    if (searchQuery) {
      countSql += ` AND search_query ILIKE $1`;
      countParams.push(`%${searchQuery}%`);
    }
    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0]?.total || 0);

    // Get available dates for trends
    const datesResult = await query(
      `SELECT DISTINCT DATE(created_at) as trend_date 
       FROM trends 
       WHERE celebrity_name IS NOT NULL AND celebrity_name != ''
       ORDER BY trend_date DESC`,
      []
    );
    const availableDates = datesResult.rows.map(row => row.trend_date);

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
