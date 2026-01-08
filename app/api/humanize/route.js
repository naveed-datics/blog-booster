import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { auth } from '@/lib/auth';

// REPLACEMENTS dictionary - converting business jargon to simpler language
const REPLACEMENTS = {
  "\\bcomprehensive guide\\b": "detailed look",
  "\\bdeep dive\\b": "closer look",
  "\\bauthoritative\\b": "clear",
  "\\bmultifaceted\\b": "many-sided",
  "\\brobust\\b": "strong",
  "\\bleverage\\b": "use",
  "\\butilize\\b": "use",
  "\\bholistic\\b": "complete",
  "\\bnuanced\\b": "subtle",
  "\\bseamless(ly)?\\b": "smoothly",
  "\\bin order to\\b": "to",
  "\\bit should be noted that\\b": "",
  "\\bdue to the fact that\\b": "because",
  "\\bat this point in time\\b": "now",
  "\\bwith regard to\\b": "about",
  "\\bbest practices\\b": "methods",
  "\\binnovative\\b": "new",
  "\\bstate of the art\\b": "modern",
  "\\bsuccessfully executed\\b": "completed",
  "\\bsynergy\\b": "collaboration",
  "\\bparadigm shift\\b": "change",
  "\\bvalue-added\\b": "useful",
  "\\bin terms of\\b": "in",
  "\\bcore competencies\\b": "skills",
  "\\bthought leader\\b": "expert",
  "\\bdynamic\\b": "changing",
  "\\bcutting-edge\\b": "advanced",
  "\\bscalable\\b": "expandable",
  "\\bactionable insights\\b": "useful information",
  "\\bdisruptive\\b": "innovative",
  "\\bgame-changing\\b": "significant",
  "\\bnext-generation\\b": "modern",
  "\\bmission-critical\\b": "essential",
  "\\bstrategic alignment\\b": "coordination",
  "\\bleveraged expertise\\b": "expert knowledge",
  "\\bflexibility\\b": "adaptability",
  "\\bstreamlined\\b": "simplified",
  "\\bintegrated solution\\b": "unified solution",
  "\\bcutting-edge technology\\b": "latest technology",
  "\\bbest-in-class\\b": "top-quality",
  "\\bmaximize impact\\b": "increase effectiveness",
  "\\bsynergistic relationship\\b": "cooperative relationship",
  "\\bproactive\\b": "active",
  "\\bgoing forward\\b": "henceforth",
  "\\bend-to-end\\b": "complete",
  "\\boperational efficiency\\b": "effectiveness",
  "\\bempower\\b": "enable",
  "\\btransformative\\b": "significant",
  "\\bgranular\\b": "detailed",
  "\\bhigh-level overview\\b": "summary",
  "\\bkey stakeholders\\b": "main participants",
  "\\bvalue proposition\\b": "benefit",
  "\\boptimize\\b": "improve",
  "\\bonboarding\\b": "introduction",
  "\\btouchpoint\\b": "interaction",
  "\\bscalable solution\\b": "flexible solution",
  "\\blower-hanging fruit\\b": "easy wins",
  "\\bdisruptor\\b": "innovator",
  "\\bideate\\b": "brainstorm",
  "\\bcircle back\\b": "follow up",
  "\\boffline\\b": "later",
  "\\bdeeply engaged\\b": "involved",
  "\\bthought leadership\\b": "expertise",
  "\\bboilerplate\\b": "standard",
  "\\bdeliverable\\b": "output",
  "\\bscalable framework\\b": "flexible structure",
  "\\btop-of-mind\\b": "priority",
  "\\bclient-centric\\b": "customer-focused",
  "\\bstakeholder engagement\\b": "participant involvement",
  "\\bmove the needle\\b": "make progress",
  "\\bat scale\\b": "widely",
  "\\bvalue chain\\b": "process",
  "\\bon the same page\\b": "aligned",
  "\\bbandwidth\\b": "capacity",
  "\\bquick win\\b": "easy success",
  "\\bboots on the ground\\b": "team effort",
  "\\bdeep expertise\\b": "strong knowledge",
  "\\bgame plan\\b": "strategy",
  "\\bbring to the table\\b": "contribute",
  "\\btake it to the next level\\b": "improve",
  "\\balignment\\b": "agreement",
  "\\bkey differentiator\\b": "unique feature",
  "\\bagile methodology\\b": "flexible approach",
  "\\bcore competency\\b": "main skill",
  "\\bcross-functional\\b": "collaborative, across teams",
  "\\bdrill down\\b": "explore in detail",
  "\\benablement\\b": "support",
  "\\bescalate\\b": "raise an issue",
  "\\becosystem\\b": "network",
  "\\bframework\\b": "structure, system",
  "\\bgranularity\\b": "detail",
  "\\bheadwinds\\b": "challenges, obstacles",
  "\\bincubation\\b": "development",
  "\\biterat(e|ion)\\b": "repeat, refine",
  "\\bkpi(s)?\\b": "key metric, goal",
  "\\bmonetize\\b": "earn from, make money from",
  "\\bon the back burner\\b": "on hold, delayed",
  "\\bpain point\\b": "problem",
  "\\bpivot\\b": "change direction",
  "\\broadmap\\b": "plan",
  "\\bramp up\\b": "increase, start",
  "\\bright-size\\b": "adjust, resize",
  "\\bsandbox\\b": "testing environment",
  "\\bsynergy\\b": "teamwork, collaboration",
  "\\btable stakes\\b": "basic requirements",
  "\\btactical\\b": "practical",
  "\\btrajectory\\b": "path, direction",
  "\\btouch base\\b": "talk, connect",
  "\\bvertical\\b": "industry, sector",
  "\\bvalue-add\\b": "useful, beneficial",
  "\\bwholistic\\b": "complete, full-picture",
  "\\bwicked problem\\b": "complex problem",
  "\\baction plan\\b": "plan",
  "\\bbriefing\\b": "update, summary",
  "\\bcontingency plan\\b": "backup plan",
  "\\bdeliverables\\b": "outputs, results",
  "\\bempowerment\\b": "giving authority",
  "\\bfacilitate\\b": "help, enable",
  "\\bfeedback loop\\b": "feedback cycle",
  "\\bgo-to-market strategy\\b": "sales plan",
  "\\bhandshake\\b": "agreement",
  "\\bincentivize\\b": "motivate, encourage",
  "\\binnovation\\b": "new idea",
  "\\binteroperability\\b": "compatibility",
  "\\bmarket share\\b": "market percentage",
  "\\bmonetization\\b": "making money",
  "\\boffsite\\b": "meeting away from the office",
  "\\bprospect\\b": "potential client",
  "\\bquarterback\\b": "lead",
  "\\breturn on investment\\b": "profit",
  "\\bscope creep\\b": "growing project requirements",
  "\\bseamless integration\\b": "smooth connection",
  "\\bsil(o|oed)\\b": "isolated, separate",
  "\\bsolution\\b": "answer, product",
  "\\bsprint\\b": "short work period",
  "\\bstakeholder\\b": "interested party",
  "\\bstrategic plan\\b": "long-term plan",
  "\\buser experience\\b": "user's experience",
  "\\bvisibility\\b": "awareness",
  "\\bworkflow\\b": "process",
  "\\bbubble up\\b": "emerge",
  "\\bcircle back\\b": "revisit",
  "\\bclose the loop\\b": "complete the task",
  "\\bcross-pollinate\\b": "share ideas",
  "\\bdeep-dive\\b": "in-depth analysis",
  "\\bducks in a row\\b": "things in order",
  "\\bgo live\\b": "launch",
  "\\blearnings\\b": "lessons",
  "\\bping\\b": "contact",
  "\\bpitch\\b": "proposal",
  "\\brollout\\b": "launch",
  "\\bsell-in\\b": "get approval",
  "\\bship\\b": "deliver",
  "\\bsit rep\\b": "situation report",
  "\\bstanding meeting\\b": "regular meeting",
  "\\bthink outside the box\\b": "be creative",
  "\\bwin-win\\b": "mutually beneficial",
  "\\bcatalyst\\b": "cause of change",
  "\\bconfluence\\b": "coming together",
  "\\bdichotomy\\b": "contrast",
  "\\bdisseminate\\b": "distribute",
  "\\bfacilitator\\b": "moderator",
  "\\bharness\\b": "use",
  "\\bimpetus\\b": "driving force",
  "\\bliaison\\b": "connection",
  "\\bmandate\\b": "requirement",
  "\\bmeticulous\\b": "thorough",
  "\\bmitigate\\b": "reduce, lessen",
  "\\bnomenclature\\b": "terminology",
  "\\boversight\\b": "supervision",
  "\\bparadigm\\b": "model, pattern",
  "\\bplethora\\b": "large amount",
  "\\bpragmatic\\b": "practical",
  "\\breciprocity\\b": "exchange",
  "\\brequisite\\b": "necessary",
  "\\bresonate\\b": "connect with",
  "\\bscrutinize\\b": "examine closely",
  "\\bsynergistic\\b": "cooperative",
  "\\btangible\\b": "real, physical",
  "\\butilitarian\\b": "practical",
  "\\bvanguard\\b": "forefront",
  "\\bverbose\\b": "wordy",
  "\\bviable\\b": "workable",
  "\\bwarrant\\b": "justify",
  "\\bzealous\\b": "enthusiastic",
  "\\bactionable\\b": "doable",
  "\\bbest of breed\\b": "top choice",
  "\\bbuck the trend\\b": "go against the norm",
  "\\bbuy-in\\b": "approval, support",
  "\\bchampion\\b": "support, promote",
  "\\bchurn\\b": "turnover",
  "\\bcomponentize\\b": "break into parts",
  "\\bcurate\\b": "select, organize",
  "\\bdata-driven\\b": "based on data",
  "\\bde-risk\\b": "reduce risk",
  "\\bdigital transformation\\b": "going digital",
  "\\bdownstream\\b": "later in the process",
  "\\bdouble-click\\b": "examine closely",
  "\\bdrop the ball\\b": "make a mistake",
  "\\bfast-track\\b": "speed up",
  "\\bfront-load\\b": "do early",
  "\\bfull-stack\\b": "complete",
  "\\bgreenfield\\b": "new project",
  "\\bground-up\\b": "from scratch",
  "\\bgrowth hacking\\b": "quick growth methods",
  "\\bhard stop\\b": "firm deadline",
  "\\bhit the ground running\\b": "start quickly",
  "\\bimpactful\\b": "effective",
  "\\bincrementally\\b": "gradually",
  "\\bindustry-leading\\b": "top in field",
  "\\binfluencer\\b": "key person",
  "\\bintegrate\\b": "combine",
  "\\bjump the shark\\b": "go too far",
  "\\bkeep it simple\\b": "simplify",
  "\\blean in\\b": "engage fully",
  "\\blow-hanging fruit\\b": "easy tasks",
  "\\bmindshare\\b": "awareness",
  "\\bmissioncritical\\b": "essential",
  "\\bmove fast and break things\\b": "innovate quickly",
  "\\bnorth star\\b": "guiding principle",
  "\\boperationalize\\b": "put into practice",
  "\\borganically\\b": "naturally",
  "\\boutcome-based\\b": "results-focused",
  "\\bpartnerships\\b": "collaborations",
  "\\bpeel the onion\\b": "look deeper",
  "\\bpersonalize\\b": "customize",
  "\\bphenomenal\\b": "great",
  "\\bplatform\\b": "system, base",
  "\\bprioritize\\b": "rank by importance",
  "\\bpush the envelope\\b": "innovate",
  "\\bquadrant\\b": "category",
  "\\bquantify\\b": "measure",
  "\\brapid prototyping\\b": "quick testing",
  "\\brepurpose\\b": "reuse",
  "\\brevenue stream\\b": "income source",
  "\\bscale up\\b": "expand",
  "\\bsolutioning\\b": "problem-solving",
  "\\bstandardize\\b": "make consistent",
  "\\bsticky\\b": "engaging, memorable",
  "\\bstrategize\\b": "plan",
  "\\btailwinds\\b": "advantages",
  "\\bthoughtful\\b": "careful",
  "\\btime to market\\b": "speed to launch",
  "\\btransparency\\b": "openness",
  "\\btriangulate\\b": "confirm from multiple sources",
  "\\bunpack\\b": "explain",
  "\\bupstream\\b": "earlier in the process",
  "\\buser-centric\\b": "user-focused",
  "\\bvalidate\\b": "confirm",
  "\\bvelocity\\b": "speed",
  "\\bviral\\b": "spreading quickly",
  "\\bwhiteboard\\b": "brainstorm",
  "\\bworkstream\\b": "work area",
  "\\bzoom out\\b": "see the big picture",
  "\\b360-degree view\\b": "complete perspective",
  "\\babove and beyond\\b": "extra effort",
  "\\bacross the board\\b": "everywhere",
  "\\bat the end of the day\\b": "ultimately",
  "\\bbottom line\\b": "main point",
  "\\bbreak down silos\\b": "improve communication",
  "\\bchange management\\b": "handling change",
  "\\bcompetitive advantage\\b": "edge over others",
  "\\bdisruption\\b": "major change",
  "\\bempower teams\\b": "give teams authority",
  "\\bfuture-proof\\b": "prepare for the future",
  "\\bgrowth mindset\\b": "learning attitude",
  "\\bindustry best practices\\b": "standard methods",
  "\\bmarket penetration\\b": "market entry",
  "\\borganizational culture\\b": "company values",
  "\\bperformance metrics\\b": "success measures",
  "\\bquality assurance\\b": "checking quality",
  "\\brisk management\\b": "handling risks",
  "\\bstakeholder buy-in\\b": "stakeholder support",
  "\\btalent acquisition\\b": "hiring",
  "\\bvalue engineering\\b": "cost optimization",
};

/**
 * Humanize text by applying replacements and breaking long sentences
 */
function humanizeText(text) {
  let result = text;
  
  // Apply all replacements
  for (const [pattern, replacement] of Object.entries(REPLACEMENTS)) {
    const regex = new RegExp(pattern, 'gi');
    result = result.replace(regex, replacement);
  }

  // Split into sentences and process
  const sentences = result.split(/(?<=[.!?])\s+/);
  const newSentences = [];
  
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    
    // Break long sentences with commas (25% chance)
    const words = trimmed.split(/\s+/);
    if (words.length > 18 && trimmed.includes(',') && Math.random() < 0.25) {
      const parts = trimmed.split(',', 2);
      if (parts.length === 2) {
        newSentences.push(parts[0] + '. ' + parts[1]);
        continue;
      }
    }
    
    newSentences.push(trimmed);
  }
  
  return newSentences.join(' ');
}

/**
 * Humanize HTML content while preserving tags
 */
function humanizeHtml(html) {
  const $ = cheerio.load(html, null, false);
  
  // Process all text nodes, excluding script and style tags
  $('*').each(function() {
    const $el = $(this);
    // Skip script and style tags
    if (this.tagName === 'script' || this.tagName === 'style') {
      return;
    }
    
    // Process direct text children
    $el.contents().each(function() {
      if (this.type === 'text') {
        const text = $(this).text();
        if (text.trim()) {
          const humanized = humanizeText(text);
          $(this).replaceWith(humanized);
        }
      }
    });
  });
  
  return $.html();
}

export async function POST(request) {
  try {
    // Check authentication
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { html, call_ai } = body;

    if (!html || typeof html !== 'string') {
      return NextResponse.json(
        { error: "Missing or invalid 'html' field" },
        { status: 400 }
      );
    }

    // First apply local humanization (fast, deterministic)
    let localResult = humanizeHtml(html);

    // If AI pass is requested
    if (call_ai) {
      try {
        // Get Azure OpenAI configuration from environment
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
          return NextResponse.json(
            { error: 'Azure OpenAI configuration not found. Please check AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT_NAME in .env.local' },
            { status: 500 }
          );
        }

        // Use Azure OpenAI via fetch
        const endpoint = azureEndpoint.replace(/\/$/, '');
        const azureUrl = `${endpoint}/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion}`;
        
        console.log('Using Azure OpenAI for humanization:', { 
          endpoint, 
          deploymentName: azureDeploymentName, 
          apiVersion: azureApiVersion
        });
        
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
                content: 'Keep all HTML tags exactly as they are. Do not change the HTML. Keep it the same and make sure all closing tags are closed properly. Do not use long and short dash (—). NO CONTRACTIONS! Write "I will" instead of "I\'ll", "it is" instead of "it\'s". Keep punctuation simple. Do not change tags.'
              },
              {
                role: 'user',
                content: localResult
              }
            ],
            max_tokens: 4500,
            temperature: 0.9,
            top_p: 0.95
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
            errorMessage = `Azure OpenAI API error: ${response.status} ${response.statusText}. ${errorText.substring(0, 200)}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        let aiOutput = data.choices[0]?.message?.content || localResult;

        // Remove em dashes
        aiOutput = aiOutput.replace(/—/g, ' ');
        
        return NextResponse.json({
          humanized_html: aiOutput
        });
      } catch (error) {
        console.error('AI humanization error:', error);
        // Return local result with error info
        return NextResponse.json({
          humanized_html: localResult,
          ai_error: error.message
        });
      }
    }

    // Return local humanization result
    return NextResponse.json({
      humanized_html: localResult
    });
  } catch (error) {
    console.error('Error in humanize API:', error);
    return NextResponse.json(
      { error: 'Failed to humanize content', details: error.message },
      { status: 500 }
    );
  }
}

