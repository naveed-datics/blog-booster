import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runClaudeText } from '@/lib/claudeLlm';

export const dynamic = 'force-dynamic';

// POST - round-trips one tiny job through the Claude LLM relay so the
// settings page can confirm the saved key actually works. Kept separate
// from the save handler: a bad key should still be storable (and fixable)
// without the save failing.
export async function POST() {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();
    const result = await runClaudeText({
      instructions: 'Reply with exactly: OK',
      text: 'connection test',
    });

    return NextResponse.json({
      success: true,
      elapsedMs: Date.now() - startedAt,
      reply: result.slice(0, 200),
    });
  } catch (error) {
    console.error('Claude LLM test failed:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 200 }
    );
  }
}
