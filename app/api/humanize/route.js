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
 * Remove AI detection patterns from text
 */
function removeAIDetection(text) {
  let result = text;
  
  // Common AI-sounding phrases to remove or replace
  // Overly formal transitions - remove them
  result = result.replace(/\b(furthermore|moreover|in addition|additionally|consequently|therefore|thus|hence)\b/gi, '');
  result = result.replace(/\b(it is important to note that|it should be noted that|it is worth mentioning that)\b/gi, '');
  result = result.replace(/\b(in conclusion|to conclude|to summarize|in summary)\b/gi, '');
  
  // Overly structured phrases - simplify
  result = result.replace(/\bfirstly\b/gi, 'first');
  result = result.replace(/\bsecondly\b/gi, 'second');
  result = result.replace(/\bthirdly\b/gi, 'third');
  result = result.replace(/\bfourthly\b/gi, 'fourth');
  result = result.replace(/\bfifthly\b/gi, 'fifth');
  
  // Generic filler phrases - remove
  result = result.replace(/\b(as we can see|as one can observe|it becomes clear that)\b/gi, '');
  result = result.replace(/\b(needless to say|it goes without saying)\b/gi, '');
  
  // Overly formal language - simplify
  result = result.replace(/\butilize\b/gi, 'use');
  result = result.replace(/\butilization\b/gi, 'use');
  result = result.replace(/\bcommence\b/gi, 'start');
  result = result.replace(/\bcommencement\b/gi, 'start');
  result = result.replace(/\bterminate\b/gi, 'end');
  result = result.replace(/\btermination\b/gi, 'end');
  result = result.replace(/\bendeavor\b/gi, 'try');
  
  // Remove excessive commas and formal punctuation
  result = result.replace(/,\s*,/g, ','); // Double commas
  result = result.replace(/\s+/g, ' '); // Multiple spaces
  result = result.replace(/\s+([.!?])/g, '$1'); // Space before punctuation
  
  return result.trim();
}

/**
 * Humanize HTML content while preserving tags
 */
function humanizeHtml(html) {
  try {
    const $ = cheerio.load(html, null, false);
    
    // Process all text nodes by walking the DOM tree
    const processNodes = ($element) => {
      $element.contents().each(function() {
        const node = this;
        
        // Skip script and style tags entirely (don't process their contents)
        if (node.type === 'tag' && (node.tagName === 'script' || node.tagName === 'style')) {
          return;
        }
        
        // Process text nodes directly
        if (node.type === 'text') {
          const originalText = node.data || '';
          if (originalText && originalText.trim()) {
            const humanized = humanizeText(originalText);
            if (humanized !== originalText && humanized.trim()) {
              // Replace the text node's data directly
              node.data = humanized;
            }
          }
        } 
        // Recursively process child elements
        else if (node.type === 'tag') {
          processNodes($(node));
        }
      });
    };
    
    // Start processing from the root
    // Check if body exists, otherwise process the entire document
    if ($('body').length > 0) {
      processNodes($('body'));
    } else {
      processNodes($.root());
    }
    
    const result = $.html();
    console.log('Humanize: HTML processing complete. Input length:', html.length, 'Output length:', result.length);
    return result;
  } catch (error) {
    console.error('Error in humanizeHtml:', error);
    // Fallback: return original HTML if processing fails
    return html;
  }
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
    const { html } = body;

    if (!html || typeof html !== 'string') {
      return NextResponse.json(
        { error: "Missing or invalid 'html' field" },
        { status: 400 }
      );
    }

    // First apply local humanization (fast, deterministic)
    console.log('Humanize API: Starting local humanization, input length:', html.length);
    let localResult = humanizeHtml(html);
    console.log('Humanize API: Local humanization completed, output length:', localResult.length);
    console.log('Humanize API: Content changed:', localResult !== html);

    // Always call AI for humanization (using same pattern as other APIs)
    try {
      // Get Azure OpenAI config (same pattern as write-blog route)
      let azureApiKey = process.env.AZURE_OPENAI_API_KEY;
      let azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
      let azureDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
      let azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';

      // Remove quotes if present (common in .env files)
      if (azureApiKey) azureApiKey = azureApiKey.replace(/^["']|["']$/g, '');
      if (azureEndpoint) azureEndpoint = azureEndpoint.replace(/^["']|["']$/g, '');
      if (azureDeploymentName) azureDeploymentName = azureDeploymentName.replace(/^["']|["']$/g, '');
      if (azureApiVersion) azureApiVersion = azureApiVersion.replace(/^["']|["']$/g, '');

      // Use Azure OpenAI if configured, otherwise use standard OpenAI
      const useAzure = azureApiKey && azureEndpoint && azureDeploymentName;
      const openaiApiKey = process.env.OPENAI_API_KEY;

      if (!useAzure && !openaiApiKey) {
        console.warn('Azure OpenAI and OpenAI API keys not configured, skipping AI humanization.');
        return NextResponse.json({
          humanized_html: localResult,
          warning: 'AI humanization skipped: No OpenAI configuration found.',
        });
      }

      let aiOutput = '';

      if (useAzure) {
        // Use Azure OpenAI
        const endpoint = azureEndpoint.replace(/\/$/, '');
        const azureUrl = `${endpoint}/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion}`;

        console.log('Humanize API: Using Azure OpenAI:', {
          endpoint,
          deploymentName: azureDeploymentName,
          apiVersion: azureApiVersion,
        });

        const response = await fetch(azureUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': azureApiKey,
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content:
                  'You are a human writer rewriting content to sound natural and conversational. Make it friendly like talking to a friend. ' +
                  'CRITICAL: Remove all AI detection patterns. Avoid overly formal language, repetitive sentence structures, and generic transitions. ' +
                  'Write naturally with varied sentence lengths. Use simple, direct language. Avoid phrases like "furthermore", "moreover", "in conclusion", "it is important to note". ' +
                  'Keep all HTML tags exactly as they are. Do not change HTML structure. Make sure all closing tags are closed properly. ' +
                  'Do not use long and short dash (—). ' +
                  'NO CONTRACTIONS! Write "I will" instead of "I\'ll", "it is" instead of "it\'s". ' +
                  'Keep punctuation simple. Vary your writing style naturally. Write like a real person, not a robot.',
              },
              {
                role: 'user',
                content: localResult,
              },
            ],
            max_tokens: 4500,
            temperature: 0.9,
            top_p: 0.95,
          }),
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
        aiOutput = data.choices[0]?.message?.content || localResult;
      } else {
        // Use standard OpenAI
        console.log('Humanize API: Using standard OpenAI');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [
              {
                role: 'system',
                content:
                  'You are a human writer rewriting content to sound natural and conversational. Make it friendly like talking to a friend. ' +
                  'CRITICAL: Remove all AI detection patterns. Avoid overly formal language, repetitive sentence structures, and generic transitions. ' +
                  'Write naturally with varied sentence lengths. Use simple, direct language. Avoid phrases like "furthermore", "moreover", "in conclusion", "it is important to note". ' +
                  'Keep all HTML tags exactly as they are. Do not change HTML structure. Make sure all closing tags are closed properly. ' +
                  'Do not use long and short dash (—). ' +
                  'NO CONTRACTIONS! Write "I will" instead of "I\'ll", "it is" instead of "it\'s". ' +
                  'Keep punctuation simple. Vary your writing style naturally. Write like a real person, not a robot.',
              },
              {
                role: 'user',
                content: localResult,
              },
            ],
            max_tokens: 4500,
            temperature: 0.9,
            top_p: 0.95,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            `OpenAI API error: ${errorData.error?.message || response.statusText}`
          );
        }

        const data = await response.json();
        aiOutput = data.choices[0]?.message?.content || localResult;
      }

      // Remove em dashes for safety
      aiOutput = aiOutput.replace(/—/g, ' ');
      
      // Apply post-processing to remove AI detection patterns
      // Process text nodes only, preserving HTML structure
      try {
        const $ = cheerio.load(aiOutput, null, false);
        
        // Process all text nodes
        const processTextNodes = ($element) => {
          $element.contents().each(function() {
            const node = this;
            
            // Skip script and style tags
            if (node.type === 'tag' && (node.tagName === 'script' || node.tagName === 'style')) {
              return;
            }
            
            // Process text nodes
            if (node.type === 'text') {
              const originalText = node.data || '';
              if (originalText && originalText.trim()) {
                const cleaned = removeAIDetection(originalText);
                if (cleaned !== originalText && cleaned.trim()) {
                  node.data = cleaned;
                }
              }
            } 
            // Recursively process child elements
            else if (node.type === 'tag') {
              processTextNodes($(node));
            }
          });
        };
        
        // Start processing from root
        if ($('body').length > 0) {
          processTextNodes($('body'));
        } else {
          processTextNodes($.root());
        }
        
        aiOutput = $.html();
      } catch (error) {
        console.error('Error in post-processing AI output:', error);
        // Continue with original output if post-processing fails
      }

      return NextResponse.json({
        humanized_html: aiOutput,
      });
    } catch (error) {
      console.error('AI humanization error:', error);
      // Return local result with error info
      return NextResponse.json({
        humanized_html: localResult,
        ai_error: error.message,
      });
    }

    // Return local humanization result when AI not requested
    return NextResponse.json({
      humanized_html: localResult,
    });
  } catch (error) {
    console.error('Error in humanize API:', error);
    return NextResponse.json(
      { error: 'Failed to humanize content', details: error.message },
      { status: 500 }
    );
  }
}

