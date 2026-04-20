import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, Copy, KeyRound, Lock, Search, ShieldCheck } from 'lucide-react';
import { Badge, Button, Input } from '@dm3/ui';
import { toast } from '@/lib/toast';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Endpoint {
  method: Method;
  path: string;
  summary: string;
  scope?: string;
}

interface Section {
  id: string;
  title: string;
  description: string;
  endpoints: Endpoint[];
}

const SECTIONS: Section[] = [
  {
    id: 'identity',
    title: 'Identity',
    description: 'Users, companies, and profiles scoped to your tenant.',
    endpoints: [
      { method: 'GET', path: '/api/v1/identity/users', summary: 'List users in the tenant', scope: 'identity:read' },
      { method: 'GET', path: '/api/v1/identity/users/{id}', summary: 'Get a single user', scope: 'identity:read' },
      { method: 'POST', path: '/api/v1/identity/users', summary: 'Create a user', scope: 'identity:write' },
      { method: 'PUT', path: '/api/v1/identity/users/{id}', summary: 'Update a user', scope: 'identity:write' },
      { method: 'DELETE', path: '/api/v1/identity/users/{id}', summary: 'Delete a user', scope: 'identity:write' },
      { method: 'GET', path: '/api/v1/identity/departments', summary: 'List departments', scope: 'identity:read' },
    ],
  },
  {
    id: 'access',
    title: 'Access Control',
    description: 'Access groups, rules, and schedules that determine who can go where and when.',
    endpoints: [
      { method: 'GET', path: '/api/v1/access/groups', summary: 'List access groups', scope: 'access:read' },
      { method: 'POST', path: '/api/v1/access/groups', summary: 'Create an access group', scope: 'access:write' },
      { method: 'PUT', path: '/api/v1/access/groups/{id}', summary: 'Update an access group', scope: 'access:write' },
      { method: 'DELETE', path: '/api/v1/access/groups/{id}', summary: 'Delete an access group', scope: 'access:write' },
      { method: 'GET', path: '/api/v1/access/schedules', summary: 'List time schedules', scope: 'access:read' },
      { method: 'POST', path: '/api/v1/access/schedules', summary: 'Create a schedule', scope: 'access:write' },
    ],
  },
  {
    id: 'devices',
    title: 'Devices',
    description: 'Door controllers, readers, and gateways.',
    endpoints: [
      { method: 'GET', path: '/api/v1/devices', summary: 'List devices', scope: 'devices:read' },
      { method: 'GET', path: '/api/v1/devices/{id}', summary: 'Get a device', scope: 'devices:read' },
      { method: 'POST', path: '/api/v1/devices', summary: 'Provision a new device', scope: 'devices:write' },
      { method: 'PUT', path: '/api/v1/devices/{id}', summary: 'Update device configuration', scope: 'devices:write' },
      { method: 'POST', path: '/api/v1/devices/{id}/sync', summary: 'Trigger config sync', scope: 'devices:write' },
    ],
  },
  {
    id: 'events',
    title: 'Access Events',
    description: 'Real-time and historical entry/exit events.',
    endpoints: [
      { method: 'GET', path: '/api/v1/events', summary: 'List recent access events', scope: 'events:read' },
      { method: 'GET', path: '/api/v1/events/{id}', summary: 'Get a single event', scope: 'events:read' },
      { method: 'GET', path: '/api/v1/events/stream', summary: 'Subscribe to event stream (SSE)', scope: 'events:read' },
    ],
  },
  {
    id: 'audit',
    title: 'Audit Log',
    description: 'Immutable record of every change and auth event in your tenant.',
    endpoints: [
      { method: 'GET', path: '/api/v1/audit/tenant/logs', summary: 'Query audit logs', scope: 'audit:read' },
      { method: 'GET', path: '/api/v1/audit/tenant/logs/{id}', summary: 'Get a single audit entry', scope: 'audit:read' },
    ],
  },
  {
    id: 'visitor',
    title: 'Visitor',
    description: 'Visitor invites, check-ins, and host notifications. Requires the visitor plugin.',
    endpoints: [
      { method: 'GET', path: '/api/v1/visitor/visitors', summary: 'List visitors', scope: 'visitor:read' },
      { method: 'POST', path: '/api/v1/visitor/visitors', summary: 'Create a visitor invite', scope: 'visitor:write' },
      { method: 'POST', path: '/api/v1/visitor/visitors/{id}/checkin', summary: 'Check a visitor in', scope: 'visitor:write' },
    ],
  },
  {
    id: 'parking',
    title: 'Parking',
    description: 'Vehicles and parking sessions. Requires the parking plugin.',
    endpoints: [
      { method: 'GET', path: '/api/v1/parking/vehicles', summary: 'List registered vehicles', scope: 'parking:read' },
      { method: 'POST', path: '/api/v1/parking/vehicles', summary: 'Register a vehicle', scope: 'parking:write' },
      { method: 'GET', path: '/api/v1/parking/sessions', summary: 'List parking sessions', scope: 'parking:read' },
    ],
  },
  {
    id: 'cctv',
    title: 'CCTV',
    description: 'Live streams, recordings, and camera inventory. Requires the CCTV plugin.',
    endpoints: [
      { method: 'GET', path: '/api/v1/cctv/cameras', summary: 'List cameras', scope: 'cctv:read' },
      { method: 'GET', path: '/api/v1/cctv/cameras/{id}/stream', summary: 'Get live stream URL', scope: 'cctv:read' },
      { method: 'GET', path: '/api/v1/cctv/clips', summary: 'List recorded clips', scope: 'cctv:read' },
    ],
  },
];

function methodColor(m: Method): string {
  switch (m) {
    case 'GET':
      return 'border-secure/30 bg-secure/10 text-secure';
    case 'POST':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    case 'PUT':
    case 'PATCH':
      return 'border-operate/30 bg-operate/10 text-operate';
    case 'DELETE':
      return 'border-destructive/30 bg-destructive/10 text-destructive';
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast(`${label} copied`, 'success');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Copy failed', 'error');
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  return (
    <div className="relative group rounded-md border border-border bg-background/60">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{language}</span>
        <CopyButton value={code} label="Snippet" />
      </div>
      <pre className="overflow-x-auto p-3 text-[12px] leading-relaxed text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ApiDocsPage() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-tenant.duali.com';

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.map((section) => {
      const endpoints = section.endpoints.filter(
        (e) =>
          e.path.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.scope?.toLowerCase().includes(q) ||
          e.method.toLowerCase().includes(q),
      );
      return { ...section, endpoints };
    }).filter((s) => s.endpoints.length > 0);
  }, [query]);

  const curlExample = `curl -H "Authorization: Bearer dm3_live_xxxxxxxxxxxxxxxxxxxx" \\
  ${origin}/api/v1/identity/users`;

  const jsExample = `const res = await fetch("${origin}/api/v1/identity/users", {
  headers: {
    Authorization: "Bearer dm3_live_xxxxxxxxxxxxxxxxxxxx",
  },
});
const data = await res.json();`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 space-y-4 border-b border-border p-6 pb-5">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/settings/api-tokens')}
            data-testid="apidocs-button-back"
          >
            <ArrowLeft size={16} />
          </Button>
          <div className="flex-1">
            <h1 className="flex items-center gap-2 text-[18px] font-semibold text-foreground">
              <BookOpen size={18} className="text-secure" />
              {t('apiDocs.title', 'API Documentation')}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {t(
                'apiDocs.description',
                'Reference for integrating third-party systems with the Duall Master API using API tokens or OAuth client credentials.',
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/settings/api-tokens')}
            data-testid="apidocs-button-manage-tokens"
          >
            <KeyRound size={14} className="mr-1.5" />
            {t('apiDocs.manageTokens', 'Manage tokens')}
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('apiDocs.searchPlaceholder', 'Search endpoints, paths, scopes…')}
            className="pl-9"
            data-testid="apidocs-input-search"
          />
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-10 px-6 py-8">
          {/* Auth */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck size={16} className="text-secure" />
              <h2 className="text-[15px] font-semibold text-foreground">
                {t('apiDocs.authTitle', 'Authentication')}
              </h2>
            </div>
            <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
              {t(
                'apiDocs.authBody',
                'Every request must include an API token or OAuth access token in the Authorization header. Tokens are tenant-scoped — they only access data belonging to the issuing tenant.',
              )}
            </p>
            <CodeBlock code={`Authorization: Bearer dm3_live_xxxxxxxxxxxxxxxxxxxx`} language="header" />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-card p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="border-secure/40 text-secure">
                    live
                  </Badge>
                  <span className="text-[12px] font-medium text-foreground">{t('apiDocs.liveTitle', 'Production')}</span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {t(
                    'apiDocs.liveBody',
                    'Tokens prefixed dm3_live_* act on real tenant data. Treat them as production credentials.',
                  )}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="border-operate/40 text-operate">
                    test
                  </Badge>
                  <span className="text-[12px] font-medium text-foreground">{t('apiDocs.testTitle', 'Testing')}</span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {t(
                    'apiDocs.testBody',
                    'Tokens prefixed dm3_test_* are for sandbox integrations. Same API surface — use them for CI and local development.',
                  )}
                </p>
              </div>
            </div>
          </section>

          {/* Quickstart */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <KeyRound size={16} className="text-secure" />
              <h2 className="text-[15px] font-semibold text-foreground">
                {t('apiDocs.quickstartTitle', 'Quickstart')}
              </h2>
            </div>
            <p className="mb-4 text-[13px] text-muted-foreground">
              {t(
                'apiDocs.quickstartBody',
                'Create a token on the API Integration page, then try a read request:',
              )}
            </p>
            <div className="space-y-3">
              <CodeBlock code={curlExample} language="curl" />
              <CodeBlock code={jsExample} language="javascript" />
            </div>
          </section>

          {/* Scopes / Rate limiting short note */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Lock size={16} className="text-secure" />
              <h2 className="text-[15px] font-semibold text-foreground">
                {t('apiDocs.scopesTitle', 'Scopes & rate limits')}
              </h2>
            </div>
            <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-muted-foreground">
              <li>
                {t(
                  'apiDocs.scopesItem1',
                  'A token with no scopes has full access to every endpoint the API Integration plugin exposes. Prefer narrow scopes.',
                )}
              </li>
              <li>
                {t(
                  'apiDocs.scopesItem2',
                  'Default rate limit is 60 requests/minute per token. Contact your admin to request a higher tier.',
                )}
              </li>
              <li>
                {t(
                  'apiDocs.scopesItem3',
                  'Tokens can be locked to specific source IPs via IP whitelist at creation time.',
                )}
              </li>
            </ul>
          </section>

          {/* Endpoints */}
          <section>
            <div className="mb-4">
              <h2 className="text-[15px] font-semibold text-foreground">
                {t('apiDocs.endpointsTitle', 'Endpoints')}
              </h2>
              <p className="text-[12px] text-muted-foreground">
                {t(
                  'apiDocs.endpointsSubtitle',
                  'Grouped by domain. The scope listed on each row is the minimum required scope.',
                )}
              </p>
            </div>

            {filteredSections.length === 0 ? (
              <div className="rounded-md border border-border bg-card p-6 text-center text-[13px] text-muted-foreground">
                {t('apiDocs.noMatches', 'No endpoints match your search.')}
              </div>
            ) : (
              <div className="space-y-6">
                {filteredSections.map((section) => (
                  <div key={section.id} className="rounded-md border border-border bg-card">
                    <div className="border-b border-border px-4 py-3">
                      <h3 className="text-[14px] font-semibold text-foreground">{section.title}</h3>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">{section.description}</p>
                    </div>
                    <ul className="divide-y divide-border">
                      {section.endpoints.map((ep) => (
                        <li
                          key={`${ep.method}-${ep.path}`}
                          className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                        >
                          <span
                            className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${methodColor(
                              ep.method,
                            )}`}
                          >
                            {ep.method}
                          </span>
                          <code className="shrink-0 font-mono text-[12px] text-foreground">{ep.path}</code>
                          <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                            {ep.summary}
                          </span>
                          {ep.scope ? (
                            <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                              {ep.scope}
                            </Badge>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="rounded-md border border-border bg-card p-4 text-[12px] text-muted-foreground">
              {t(
                'apiDocs.footerNote',
                'This reference covers the stable public surface. Internal/device-gateway endpoints are not listed and not covered by our compatibility guarantees.',
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
