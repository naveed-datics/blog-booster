import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(request, { params }) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const userId = parseInt(session.user.id);
    const websiteId = parseInt(resolvedParams.id);

    // Verify the website belongs to the user
    const websiteCheck = await query(
      "SELECT id FROM websites WHERE id = $1 AND user_id = $2",
      [websiteId, userId]
    );

    if (websiteCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Website not found or access denied" },
        { status: 404 }
      );
    }

    // Fetch trending data using the same query logic as /api/trends
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Use the same query structure as /api/trends, but filter only celebrity names
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
        updated_at
      FROM trends
      WHERE celebrity_name IS NOT NULL AND celebrity_name != ''
    `;
    const queryParams = [];
    let paramIndex = 1;

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${
      paramIndex + 1
    }`;
    queryParams.push(limit, offset);

    const result = await query(sql, queryParams);

    // Filter out obvious non-celebrities (countries, products, etc.)
    let filteredRows = result.rows.filter((row) => {
      if (!row.celebrity_name) return false;
      const name = row.celebrity_name.toLowerCase().trim();

      // Filter out countries
      const countries = [
        "iran",
        "usa",
        "uk",
        "china",
        "india",
        "japan",
        "germany",
        "france",
        "spain",
        "italy",
        "brazil",
        "russia",
        "canada",
        "australia",
        "mexico",
        "korea",
        "turkey",
        "poland",
        "netherlands",
        "belgium",
        "sweden",
        "norway",
        "denmark",
        "finland",
        "greece",
        "portugal",
        "israel",
        "egypt",
        "saudi",
        "uae",
        "qatar",
        "kuwait",
        "bahrain",
        "oman",
        "jordan",
        "lebanon",
        "syria",
        "iraq",
        "afghanistan",
        "pakistan",
        "bangladesh",
        "sri lanka",
        "thailand",
        "vietnam",
        "indonesia",
        "philippines",
        "malaysia",
        "singapore",
        "hong kong",
        "taiwan",
      ];
      if (countries.includes(name)) return false;

      // Filter out products/brands
      if (
        name.includes("jeans") ||
        name.includes("brand") ||
        name.includes("product")
      )
        return false;

      // Filter out websites/domains
      if (
        name.includes(".com") ||
        name.includes(".org") ||
        name.includes("www") ||
        name.includes("http")
      )
        return false;

      // Filter out if it contains "religion" as a standalone word (not part of a name)
      if (
        name.includes(" religion") ||
        name.endsWith(" religion") ||
        name === "religion"
      )
        return false;

      // Filter out if it contains trend values/percentages
      if (name.includes("+") || name.includes("%") || name.includes("breakout"))
        return false;

      // Filter out generic terms
      const genericTerms = [
        "infocatolica",
        "info",
        "news",
        "article",
        "blog",
        "website",
      ];
      if (genericTerms.some((term) => name.includes(term))) return false;

      return true;
    });

    // Get total count (same as trends API, filtered for celebrities only)
    const countResult = await query(
      "SELECT COUNT(*) as total FROM trends WHERE celebrity_name IS NOT NULL AND celebrity_name != ''",
      []
    );
    const total = parseInt(countResult.rows[0]?.total || 0);

    // Transform the filtered trends data
    const trending = filteredRows.map((row) => ({
      id: row.id,
      title: row.celebrity_name || row.search_query || "Unknown",
      celebrity_name: row.celebrity_name,
      search_query: row.search_query,
      trend_text: row.trend_text,
      trend_value: row.trend_value,
      url: row.url,
      website_result: row.website_result,
      date: row.created_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return NextResponse.json({
      trending,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching trending list:", error);
    return NextResponse.json(
      { error: "Failed to fetch trending list", details: error.message },
      { status: 500 }
    );
  }
}
