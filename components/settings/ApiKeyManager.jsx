'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Copy, Check, Trash2, Loader2, KeyRound, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function formatDate(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Create, display and revoke keys that other projects use to call the
 * pipeline endpoints. A created key is shown exactly once - the server
 * stores only its hash.
 */
export function ApiKeyManager() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings/api-keys');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error);
      setKeys(data.keys || []);
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast.error(error.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;

    try {
      setCreating(true);
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error);

      setNewKey(data.key);
      setCopied(false);
      setName('');
      await loadKeys();
      toast.success('API key created - copy it now');
    } catch (error) {
      toast.error(error.message || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy - select the key and copy manually');
    }
  };

  const handleRevoke = async (key) => {
    if (!window.confirm(`Revoke "${key.name}"? Any project using it will stop working immediately.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/settings/api-keys?id=${key.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error);
      await loadKeys();
      toast.success(`Revoked "${key.name}"`);
    } catch (error) {
      toast.error(error.message || 'Failed to revoke key');
    }
  };

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const revokedKeys = keys.filter((k) => k.revoked_at);

  return (
    <section
      aria-labelledby="settings-api-keys"
      className="rounded-lg bg-white shadow dark:bg-gray-800"
    >
      <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-gray-700">
        <div>
          <h2
            id="settings-api-keys"
            className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white"
          >
            <KeyRound className="h-5 w-5" />
            API Keys
          </h2>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
            Give other projects access to the pipeline endpoints below. Keys cannot read
            your settings or delete posts.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {activeKeys.length} active
        </span>
      </header>

      <div className="px-6 py-4">
        {newKey && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              Copy this key now - it will not be shown again
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded border border-amber-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 dark:border-amber-700 dark:bg-gray-900 dark:text-gray-100">
                {newKey}
              </code>
              <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0 gap-1.5">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setNewKey(null)}
              className="mt-2 text-xs font-medium text-amber-800 underline dark:text-amber-300"
            >
              I&apos;ve saved it - dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleCreate} className="mb-4 flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="api-key-name" className="text-sm font-medium">
              New key name
            </Label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Marketing site, Zapier, staging worker"
              className="mt-1.5"
              maxLength={120}
            />
          </div>
          <Button type="submit" disabled={creating || !name.trim()} className="gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate
          </Button>
        </form>

        {loading ? (
          <p className="py-4 text-sm text-gray-500 dark:text-gray-400">Loading keys…</p>
        ) : keys.length === 0 ? (
          <p className="py-4 text-sm text-gray-500 dark:text-gray-400">
            No keys yet. Generate one to let another project call these endpoints.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {[...activeKeys, ...revokedKeys].map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                    {key.name}
                    {key.revoked_at && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        Revoked
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {key.key_prefix}…
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                    Created {formatDate(key.created_at)} · Last used {formatDate(key.last_used_at)}
                  </p>
                </div>
                {!key.revoked_at && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRevoke(key)}
                    className="shrink-0 gap-1.5 text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
