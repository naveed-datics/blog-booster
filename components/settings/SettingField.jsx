'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const TRUTHY = new Set(['true', '1', 'yes', 'on']);

/**
 * One editable setting. Secrets render as a write-only field: the server
 * never sends the plaintext back, so the input stays empty and shows the
 * stored mask as a placeholder until the user types a replacement.
 */
export function SettingField({ field, state, draft, onChange }) {
  const inputId = useId();
  const [revealed, setRevealed] = useState(false);

  const isSecret = Boolean(field.secret);
  const isDirty = draft !== undefined;
  const configured = Boolean(state?.configured);

  if (field.type === 'boolean') {
    const stored = TRUTHY.has(String(state?.value ?? '').toLowerCase());
    const checked = isDirty ? TRUTHY.has(String(draft).toLowerCase()) : stored;

    return (
      <div className="flex items-start justify-between gap-4 py-3">
        <div className="min-w-0">
          <Label htmlFor={inputId} className="text-sm font-medium">
            {field.label}
          </Label>
          {field.help && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.help}</p>
          )}
          <p className="mt-1 font-mono text-[11px] text-gray-400 dark:text-gray-500">
            {field.key}
          </p>
        </div>
        <Switch
          id={inputId}
          checked={checked}
          onCheckedChange={(next) => onChange(field.key, next ? 'true' : 'false')}
        />
      </div>
    );
  }

  const placeholder = isSecret
    ? configured
      ? `Saved (${state.masked}) - type to replace`
      : field.placeholder || 'Not set'
    : field.placeholder || '';

  const value = isDirty ? draft : isSecret ? '' : (state?.value ?? '');

  return (
    <div className="py-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Label htmlFor={inputId} className="text-sm font-medium">
          {field.label}
          {field.required && <span className="ml-1 text-red-500">*</span>}
        </Label>
        <div className="flex items-center gap-2">
          {configured && !isDirty && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
              <Check className="h-3 w-3" />
              Set
            </span>
          )}
          {isDirty && (
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Unsaved
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        <Input
          id={inputId}
          type={isSecret && !revealed ? 'password' : 'text'}
          inputMode={field.type === 'number' ? 'numeric' : undefined}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(field.key, event.target.value)}
          className={isSecret ? 'pr-10 font-mono text-sm' : 'font-mono text-sm'}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setRevealed((prev) => !prev)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
            aria-label={revealed ? 'Hide value' : 'Show value'}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        {field.help ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">{field.help}</p>
        ) : (
          <span />
        )}
        <p className="shrink-0 font-mono text-[11px] text-gray-400 dark:text-gray-500">
          {field.key}
        </p>
      </div>
    </div>
  );
}
