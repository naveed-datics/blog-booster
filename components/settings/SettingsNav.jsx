'use client';

import * as Icons from 'lucide-react';

/**
 * Vertical section nav for /settings.
 *
 * Vertical rather than a horizontal tab strip: there are ten sections, and a
 * horizontal strip would wrap to a second line on desktop. It collapses to a
 * horizontal scroll-snap rail under `md`, where vertical nav would push the
 * panel below the fold.
 */
export function SettingsNav({ sections, active, onSelect }) {
  return (
    <nav aria-label="Settings sections" className="md:sticky md:top-8">
      <ul
        role="tablist"
        aria-orientation="vertical"
        className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0"
      >
        {sections.map((section) => {
          const Icon = Icons[section.icon] || Icons.Circle;
          const isActive = section.id === active;

          return (
            <li key={section.id} className="shrink-0 md:shrink">
              <button
                type="button"
                role="tab"
                id={`settings-tab-${section.id}`}
                aria-selected={isActive}
                aria-controls={`settings-panel-${section.id}`}
                onClick={() => onSelect(section.id)}
                className={`group flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-900 font-medium text-white dark:bg-white dark:text-gray-900'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{section.navLabel}</span>
                {typeof section.badge === 'number' && section.badge > 0 && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                      isActive
                        ? 'bg-white/20 text-white dark:bg-gray-900/15 dark:text-gray-900'
                        : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {section.badge}
                  </span>
                )}
                {section.dirty > 0 && (
                  <span
                    aria-label={`${section.dirty} unsaved`}
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
