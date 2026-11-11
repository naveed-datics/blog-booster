'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Check, ChevronDown, BookOpen } from 'lucide-react';
import { API_CATALOG } from '@/lib/apiCatalog';

const METHOD_STYLES = {
  GET: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  POST: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
};

function CopyButton({ value, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex shrink-0 items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function CodeBlock({ children, copyValue }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
        {children}
      </pre>
      {copyValue && (
        <div className="absolute right-2 top-2">
          <CopyButton value={copyValue} />
        </div>
      )}
    </div>
  );
}

function buildCurl(endpoint, baseUrl) {
  const url = `${baseUrl}${endpoint.path}`;
  const qs = (endpoint.query || [])
    .filter((p) => p.required)
    .map((p) => `${p.name}=VALUE`)
    .join('&');
  const fullUrl = qs ? `${url}?${qs}` : url;

  const lines = [`curl -X ${endpoint.method} "${fullUrl}" \\`];
  lines.push(`  -H "Authorization: Bearer YOUR_API_KEY"`);

  if (endpoint.body) {
    lines[lines.length - 1] += ' \\';
    lines.push(`  -H "Content-Type: application/json" \\`);
    lines.push(`  -d '${JSON.stringify(endpoint.body)}'`);
  }

  return lines.join('\n');
}

function EndpointCard({ endpoint, baseUrl }) {
  const [open, setOpen] = useState(false);
  const curl = buildCurl(endpoint, baseUrl);

  return (
    <li className="border-b border-gray-100 last:border-0 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40"
      >
        <span
          className={`shrink-0 rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
            METHOD_STYLES[endpoint.method] || METHOD_STYLES.GET
          }`}
        >
          {endpoint.method}
        </span>
        <code className="shrink-0 font-mono text-xs text-gray-900 dark:text-gray-100">
          {endpoint.path}
        </code>
        <span className="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-gray-400">
          {endpoint.title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-4 px-6 pb-5">
          <p className="text-sm text-gray-600 dark:text-gray-400">{endpoint.description}</p>

          {endpoint.query?.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Query parameters
              </h4>
              <ul className="space-y-1">
                {endpoint.query.map((p) => (
                  <li key={p.name} className="text-xs text-gray-600 dark:text-gray-400">
                    <code className="font-mono text-gray-900 dark:text-gray-200">{p.name}</code>
                    {p.required ? (
                      <span className="ml-1 text-red-500">required</span>
                    ) : (
                      <span className="ml-1 text-gray-400">optional</span>
                    )}
                    {' - '}
                    {p.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {endpoint.bodyParams?.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Body fields
              </h4>
              <ul className="space-y-1">
                {endpoint.bodyParams.map((p) => (
                  <li key={p.name} className="text-xs text-gray-600 dark:text-gray-400">
                    <code className="font-mono text-gray-900 dark:text-gray-200">{p.name}</code>
                    {p.type && <span className="ml-1 text-gray-400">({p.type})</span>}
                    {p.required ? (
                      <span className="ml-1 text-red-500">required</span>
                    ) : (
                      <span className="ml-1 text-gray-400">optional</span>
                    )}
                    {' - '}
                    {p.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {endpoint.body && (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Request body
              </h4>
              <CodeBlock copyValue={JSON.stringify(endpoint.body, null, 2)}>
                {JSON.stringify(endpoint.body, null, 2)}
              </CodeBlock>
            </div>
          )}

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Example response
            </h4>
            <CodeBlock copyValue={JSON.stringify(endpoint.example, null, 2)}>
              {JSON.stringify(endpoint.example, null, 2)}
            </CodeBlock>
          </div>

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              cURL
            </h4>
            <CodeBlock copyValue={curl}>{curl}</CodeBlock>
          </div>

          {endpoint.notes && (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              {endpoint.notes}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** Shareable documentation for the endpoints an API key may call. */
export function ApiEndpointDocs({ baseUrl }) {
  const resolvedBase = (baseUrl || '').replace(/\/+$/, '') || 'https://your-app.example.com';

  return (
    <section
      aria-labelledby="settings-api-docs"
      className="rounded-lg bg-white shadow dark:bg-gray-800"
    >
      <header className="border-b border-gray-100 px-6 py-4 dark:border-gray-700">
        <h2
          id="settings-api-docs"
          className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white"
        >
          <BookOpen className="h-5 w-5" />
          Endpoints
        </h2>
        <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
          Share these with the project that will use a key. Authenticate with{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px] dark:bg-gray-700">
            Authorization: Bearer &lt;key&gt;
          </code>{' '}
          or{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px] dark:bg-gray-700">
            x-api-key
          </code>
          .
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Base URL</span>
          <code className="min-w-0 flex-1 truncate rounded border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs dark:border-gray-700 dark:bg-gray-900">
            {resolvedBase}
          </code>
          <CopyButton value={resolvedBase} label="Copy" />
        </div>
      </header>

      <ul>
        {API_CATALOG.map((endpoint) => (
          <EndpointCard key={endpoint.id} endpoint={endpoint} baseUrl={resolvedBase} />
        ))}
      </ul>
    </section>
  );
}
