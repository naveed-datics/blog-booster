'use client';

import { SettingField } from '@/components/settings/SettingField';

/** A titled card of related settings. */
export function SettingsGroup({ group, settings, drafts, onChange, children }) {
  return (
    <section
      aria-labelledby={`settings-${group.id}`}
      className="rounded-lg bg-white shadow dark:bg-gray-800"
    >
      <header className="border-b border-gray-100 px-6 py-4 dark:border-gray-700">
        <h2
          id={`settings-${group.id}`}
          className="text-lg font-bold text-gray-900 dark:text-white"
        >
          {group.title}
        </h2>
        <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
          {group.description}
        </p>
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
