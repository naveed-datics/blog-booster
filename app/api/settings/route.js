import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSettingsForDisplay, saveSettings } from '@/lib/settings';
import { SETTINGS_GROUPS, BOOTSTRAP_ENV_KEYS, isSettableKey } from '@/lib/settingsSchema';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const session = await auth();
  if (!session || !session.user) return null;
  return session;
}

// GET - current settings for the settings page. Secret values are returned
// masked only; the plaintext never leaves the server.
export async function GET() {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await getSettingsForDisplay();

    // Reported so the UI can show which values are still environment-only
    // and whether the deployment has them.
    const bootstrap = BOOTSTRAP_ENV_KEYS.map((key) => ({
      key,
      configured: Boolean(process.env[key]),
    }));

    return NextResponse.json({ groups: SETTINGS_GROUPS, settings, bootstrap });
  } catch (error) {
    console.error('Error loading settings:', error);
    return NextResponse.json(
      { error: 'Failed to load settings', message: error.message },
      { status: 500 }
    );
  }
}

// PUT - upsert settings. Accepts a partial map, so the UI can submit only
// the fields that changed; a blank value clears that setting.
export async function PUT(request) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const updates = body?.settings;

    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return NextResponse.json(
        { error: 'settings object is required' },
        { status: 400 }
      );
    }

    const unknownKeys = Object.keys(updates).filter((key) => !isSettableKey(key));
    if (unknownKeys.length > 0) {
      return NextResponse.json(
        { error: `Unknown setting keys: ${unknownKeys.join(', ')}` },
        { status: 400 }
      );
    }

    const invalid = Object.entries(updates).filter(
      ([, value]) => value !== null && value !== undefined && typeof value !== 'string'
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Setting values must be strings: ${invalid.map(([k]) => k).join(', ')}` },
        { status: 400 }
      );
    }

    const normalized = Object.entries(updates).reduce((acc, [key, value]) => {
      acc[key] = value == null ? '' : value;
      return acc;
    }, {});

    const { saved, cleared } = await saveSettings(
      normalized,
      session.user.email || session.user.name || null
    );

    const settings = await getSettingsForDisplay();

    return NextResponse.json({
      success: true,
      saved,
      cleared,
      settings,
    });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings', message: error.message },
      { status: 500 }
    );
  }
}
