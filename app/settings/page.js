'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Save, Loader2, Lock, Zap, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsGroup } from '@/components/settings/SettingsGroup';

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
      toast.success(`Settings saved${parts.length ? ` — ${parts.join(', ')}` : ''}`);
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
        toast.success(`Claude LLM reachable — replied in ${(data.elapsedMs / 1000).toFixed(1)}s`);
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
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex h-64 items-center justify-center">
            <p className="text-gray-600 dark:text-gray-400">Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mb-2 text-4xl font-bold">Settings</h1>
            <p className="text-gray-600 dark:text-gray-400">
              API keys and pipeline configuration. Saved to the database and picked up
              within seconds — no redeploy needed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dirtyKeys.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setDrafts({})}
                disabled={saving}
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Discard
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={saving || dirtyKeys.length === 0}
              className="flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {dirtyKeys.length > 0 ? `Save ${dirtyKeys.length} change${dirtyKeys.length === 1 ? '' : 's'}` : 'Save'}
            </Button>
          </div>
        </header>

        {loadError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              {loadError}
            </p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              If this is a missing table, run <code className="font-mono">npm run migrate:app-settings</code>.
            </p>
          </div>
        )}

        <div className="space-y-6">
          {groups.map((group) => (
            <SettingsGroup
              key={group.id}
              group={group}
              settings={settings}
              drafts={drafts}
              onChange={handleChange}
            >
              {group.id === 'llm' && (
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
                    {testing ? 'Testing…' : 'Test connection'}
                  </Button>
                </div>
              )}
            </SettingsGroup>
          ))}

          <section
            aria-labelledby="settings-bootstrap"
            className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 dark:border-gray-600 dark:bg-gray-800/50"
          >
            <h2
              id="settings-bootstrap"
              className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white"
            >
              <Lock className="h-4 w-4" />
              Environment-only
            </h2>
            <p className="mt-0.5 mb-4 text-sm text-gray-600 dark:text-gray-400">
              These stay in <code className="font-mono">.env.local</code> / Vercel env vars.
              The settings table lives inside the database the connection string points at,
              and the auth secret is read before any query can run.
            </p>
            <ul className="space-y-2">
              {bootstrap.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3">
                  <code className="font-mono text-xs text-gray-700 dark:text-gray-300">
                    {item.key}
                  </code>
                  <span
                    className={
                      item.configured
                        ? 'text-[11px] font-medium text-green-600 dark:text-green-400'
                        : 'text-[11px] font-medium text-gray-400 dark:text-gray-500'
                    }
                  >
                    {item.configured ? 'Set' : 'Not set'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
