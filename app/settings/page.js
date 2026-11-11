'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Save, Loader2, Lock, Zap, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsGroup } from '@/components/settings/SettingsGroup';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { ApiKeyManager } from '@/components/settings/ApiKeyManager';
import { ApiEndpointDocs } from '@/components/settings/ApiEndpointDocs';

// Sections that are not driven by the settings schema.
const EXTRA_SECTIONS = [
  { id: 'api-keys', icon: 'KeyRound', navLabel: 'API keys' },
  { id: 'endpoints', icon: 'BookOpen', navLabel: 'Endpoints' },
  { id: 'environment', icon: 'Lock', navLabel: 'Environment' },
];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [groups, setGroups] = useState([]);
  const [settings, setSettings] = useState({});
  const [bootstrap, setBootstrap] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [active, setActive] = useState('llm');

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');
      const response = await fetch('/api/settings');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to load settings');
      }

      setGroups(data.groups || []);
      setSettings(data.settings || {});
      setBootstrap(data.bootstrap || []);
      setDrafts({});
    } catch (error) {
      console.error('Error loading settings:', error);
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated') {
      loadSettings();
    }
  }, [status, router, loadSettings]);

  // Tracks only edited fields so a save never rewrites untouched secrets
  // with the masked placeholder the server sent us.
  const handleChange = useCallback((key, value) => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  }, []);

  const dirtyKeys = useMemo(() => Object.keys(drafts), [drafts]);

  // Sidebar entries carry a configured-count badge and an unsaved-edit dot,
  // so neither state is hidden behind an inactive panel.
  const sections = useMemo(() => {
    const groupSections = groups.map((group) => ({
      id: group.id,
      icon: group.icon,
      navLabel: group.navLabel || group.title,
      badge: group.fields.filter((f) => settings[f.key]?.configured).length,
      dirty: group.fields.filter((f) => drafts[f.key] !== undefined).length,
    }));
    return [...groupSections, ...EXTRA_SECTIONS];
  }, [groups, settings, drafts]);

  const activeGroup = groups.find((group) => group.id === active);

  const handleSave = async () => {
    if (dirtyKeys.length === 0) return;

    try {
      setSaving(true);
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: drafts }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to save settings');
      }

      setSettings(data.settings || {});
      setDrafts({});

      const savedCount = data.saved?.length || 0;
      const clearedCount = data.cleared?.length || 0;
      const parts = [];
      if (savedCount) parts.push(`${savedCount} updated`);
      if (clearedCount) parts.push(`${clearedCount} cleared`);
      toast.success(`Settings saved${parts.length ? ` - ${parts.join(', ')}` : ''}`);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestLlm = async () => {
    try {
      setTesting(true);
      const response = await fetch('/api/settings/test-llm', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        toast.success(`Claude LLM reachable - replied in ${(data.elapsedMs / 1000).toFixed(1)}s`);
      } else {
        toast.error(data.error || 'Connection test failed');
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setTesting(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-[100dvh]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="h-9 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-8 grid gap-8 md:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-gray-100 dark:bg-gray-800/60" />
              ))}
            </div>
            <div className="h-80 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800/60" />
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="min-h-[100dvh]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Saved to the database and picked up within seconds. No redeploy needed.
          </p>
        </header>

        {loadError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">{loadError}</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              If this is a missing table, run{' '}
              <code className="font-mono">npm run migrate:app-settings</code>.
            </p>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[200px_1fr] md:gap-8">
          <SettingsNav sections={sections} active={active} onSelect={setActive} />

          <div className="min-w-0">
            {activeGroup && (
              <div
                role="tabpanel"
                id={`settings-panel-${activeGroup.id}`}
                aria-labelledby={`settings-tab-${activeGroup.id}`}
              >
                <SettingsGroup
                  group={activeGroup}
                  settings={settings}
                  drafts={drafts}
                  onChange={handleChange}
                >
                  {activeGroup.id === 'llm' && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Sends one short job through the relay to confirm the key works.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTestLlm}
                        disabled={testing || !settings.CLAUDE_LLM_API_KEY?.configured}
                        className="flex items-center gap-2"
                      >
                        {testing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                        {testing ? 'Testing' : 'Test connection'}
                      </Button>
                    </div>
                  )}
                </SettingsGroup>
              </div>
            )}

            {active === 'api-keys' && (
              <div
                role="tabpanel"
                id="settings-panel-api-keys"
                aria-labelledby="settings-tab-api-keys"
              >
                <ApiKeyManager />
              </div>
            )}

            {active === 'endpoints' && (
              <div
                role="tabpanel"
                id="settings-panel-endpoints"
                aria-labelledby="settings-tab-endpoints"
              >
                <ApiEndpointDocs baseUrl={settings.NEXT_PUBLIC_BASE_URL?.value || ''} />
              </div>
            )}

            {active === 'environment' && (
              <section
                role="tabpanel"
                id="settings-panel-environment"
                aria-labelledby="settings-tab-environment"
                className="rounded-lg bg-white shadow dark:bg-gray-800"
              >
                <header className="border-b border-gray-100 px-6 py-4 dark:border-gray-700">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
                    <Lock className="h-5 w-5" />
                    Environment-only
                  </h2>
                  <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                    These stay in <code className="font-mono">.env.local</code> and Vercel env
                    vars. The settings table lives inside the database the connection string
                    points at, and the auth secret is read before any query can run.
                  </p>
                </header>
                <ul className="divide-y divide-gray-100 px-6 dark:divide-gray-700">
                  {bootstrap.map((item) => (
                    <li key={item.key} className="flex items-center justify-between gap-3 py-3">
                      <code className="font-mono text-xs text-gray-700 dark:text-gray-300">
                        {item.key}
                      </code>
                      <span
                        className={
                          item.configured
                            ? 'text-[11px] font-medium text-green-700 dark:text-green-400'
                            : 'text-[11px] font-medium text-gray-500 dark:text-gray-500'
                        }
                      >
                        {item.configured ? 'Set' : 'Not set'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Pinned so edits stay saveable from any section without scrolling back. */}
      {dirtyKeys.length > 0 && (
        <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-white">
                {dirtyKeys.length}
              </span>{' '}
              unsaved {dirtyKeys.length === 1 ? 'change' : 'changes'}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDrafts({})}
                disabled={saving}
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Discard
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
