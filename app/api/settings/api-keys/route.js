import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createApiKey, listApiKeys, revokeApiKey } from '@/lib/apiKeys';

export const dynamic = 'force-dynamic';

// Managing keys is session-only on purpose: a shared API key must never be
// able to mint or revoke other keys.
async function requireSession() {
  const session = await auth();
  if (!session || !session.user) return null;
  return session;
}

// GET - list keys. Never returns key material, only prefixes and metadata.
export async function GET() {
  try {
    if (!(await requireSession())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ keys: await listApiKeys() });
  } catch (error) {
    console.error('Error listing API keys:', error);
    return NextResponse.json(
      { error: 'Failed to list API keys', message: error.message },
      { status: 500 }
    );
  }
}

// POST - create a key. The plaintext is returned exactly once.
export async function POST(request) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const name = body?.name;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'A name is required (e.g. the project that will use this key)' },
        { status: 400 }
      );
    }

    const { key, record } = await createApiKey({
      name,
      createdBy: session.user.email || session.user.name || null,
    });

    return NextResponse.json({
      success: true,
      key,
      warning: 'Copy this key now - it cannot be shown again.',
      record,
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json(
      { error: 'Failed to create API key', message: error.message },
      { status: 500 }
    );
  }
}

// DELETE - revoke a key by id (soft delete, keeps the audit trail).
export async function DELETE(request) {
  try {
    if (!(await requireSession())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || Number.isNaN(parseInt(id, 10))) {
      return NextResponse.json({ error: 'A numeric id is required' }, { status: 400 });
    }

    const revoked = await revokeApiKey(id);
    if (!revoked) {
      return NextResponse.json(
        { error: 'Key not found or already revoked' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, revoked });
  } catch (error) {
    console.error('Error revoking API key:', error);
    return NextResponse.json(
      { error: 'Failed to revoke API key', message: error.message },
      { status: 500 }
    );
  }
}
