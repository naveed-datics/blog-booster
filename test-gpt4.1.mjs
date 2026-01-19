/**
 * Test script for gpt-4.1 API call
 * Run with: node test-gpt4.1.mjs
 * 
 * Make sure you have .env.local with:
 * HUMANIZE_OPENAI_API_KEY=your_github_token_here
 * HUMANIZE_OPENAI_BASE_URL=https://models.github.ai/inference
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env.local') });

async function testGPT41() {
  console.log('🧪 Testing gpt-4.1 API call...\n');

  // Get API key
  const apiKey = process.env.HUMANIZE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.HUMANIZE_OPENAI_BASE_URL || 'https://models.github.ai/inference';

  // Check if API key is set
  if (!apiKey) {
    console.error('❌ ERROR: API key not found!');
    console.error('   Please set HUMANIZE_OPENAI_API_KEY or OPENAI_API_KEY in .env.local');
    process.exit(1);
  }

  console.log('✅ API Key found:', apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4));
  console.log('✅ Base URL:', baseURL);
  console.log('✅ Model: gpt-4.1\n');

  // Create OpenAI client
  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  // Test message
  const testContent = '<p>This is a comprehensive guide to leverage innovative solutions.</p>';

  console.log('📤 Sending test request...');
  console.log('   Input:', testContent);
  console.log('');

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content:
            'Keep all HTML tags exactly as they are. Dont Change the HTML Keep its same and make sure all clossing tags are clossed properly ' +
            'Do not use long and short dash (—) ' +
            'NO CONTRACTIONS! Write "I will" instead of "I\'ll", "it is" instead of "it\'s". ' +
            'Keep punctuation simple. Do not change tags.',
        },
        {
          role: 'user',
          content: testContent,
        },
      ],
      max_tokens: 4500,
      temperature: 0.9,
      top_p: 0.95,
    });

    const aiOutput = completion.choices?.[0]?.message?.content?.toString() || 'No content returned';

    console.log('✅ SUCCESS! API call completed\n');
    console.log('📥 Response:');
    console.log('   Output:', aiOutput);
    console.log('');
    console.log('📊 Response details:');
    console.log('   Model used:', completion.model);
    console.log('   Tokens used:', completion.usage?.total_tokens || 'N/A');
    console.log('   Finish reason:', completion.choices?.[0]?.finish_reason || 'N/A');
  } catch (error) {
    console.error('❌ ERROR: API call failed\n');
    console.error('Error details:');
    console.error('   Message:', error.message);
    console.error('   Status:', error.status || 'N/A');
    console.error('   Code:', error.code || 'N/A');
    
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response headers:', error.response.headers);
    }

    if (error.status === 401) {
      console.error('\n💡 TROUBLESHOOTING:');
      console.error('   1. Check if your API key is valid and not expired');
      console.error('   2. Verify the API key has the correct permissions');
      console.error('   3. Make sure the base URL is correct:', baseURL);
      console.error('   4. Check if the model name "gpt-4.1" is correct for this endpoint');
    }

    process.exit(1);
  }
}

// Run the test
testGPT41().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});

