'use client';

import { SettingField } from '@/components/settings/SettingField';

/** A titled card of related settings. */
export function SettingsGroup({ group, settings, drafts, onChange, children }) {
  const configuredCount = group.fields.filter((f) => settings[f.key]?.configured).length;

  return (
    <section
      aria-labelledby={`settings-${group.id}`}
      className="rounded-lg bg-white shadow dark:bg-gray-800"
    >
      <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-gray-700">
        <div>
          <h2
            id={`settings-${group.id}`}
            className="text-lg font-bold text-gray-900 dark:text-white"
          >
            {group.title}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
            {group.description}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {configuredCount}/{group.fields.length}
        </span>
      </header>

      <div className="divide-y divide-gray-100 px-6 py-2 dark:divide-gray-700">
        {group.fields.map((field) => (
          <SettingField
            key={field.key}
            field={field}
            state={settings[field.key]}
            draft={drafts[field.key]}
            onChange={onChange}
          />
        ))}
      </div>

      {children && (
        <div className="border-t border-gray-100 px-6 py-4 dark:border-gray-700">
          {children}
        </div>
      )}
    </section>
  );
}
