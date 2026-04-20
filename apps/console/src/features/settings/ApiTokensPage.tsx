import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Copy, KeyRound, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import {
  AppModal,
  Badge,
  Button,
  DatePicker,
  EmptyState,
  Input,
  Label,
  Multiselect,
  type MultiselectOption,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';

type Environment = 'live' | 'test';
type TokenStatus = 'active' | 'revoked' | 'expired';

const API_DOCS_URL = 'https://docs.duali.com/api';

interface ScopeDef {
  value: string;
  label: string;
  description: string;
}

const AVAILABLE_SCOPES: ScopeDef[] = [
  { value: 'identity:read', label: 'Identity · Read', description: 'List users, companies, profiles' },
  { value: 'identity:write', label: 'Identity · Write', description: 'Create and update users and profiles' },
  { value: 'access:read', label: 'Access · Read', description: 'Read access groups, rules, schedules' },
  { value: 'access:write', label: 'Access · Write', description: 'Manage access rules and schedules' },
  { value: 'devices:read', label: 'Devices · Read', description: 'List and inspect devices' },
  { value: 'devices:write', label: 'Devices · Write', description: 'Provision and configure devices' },
  { value: 'events:read', label: 'Events · Read', description: 'Read access events and activity' },
  { value: 'audit:read', label: 'Audit · Read', description: 'Query tenant audit logs' },
  { value: 'visitor:read', label: 'Visitor · Read', description: 'Read visitor records and invites' },
  { value: 'visitor:write', label: 'Visitor · Write', description: 'Create and manage visitors' },
  { value: 'parking:read', label: 'Parking · Read', description: 'Read vehicles and parking sessions' },
  { value: 'parking:write', label: 'Parking · Write', description: 'Manage parking vehicles and rules' },
  { value: 'cctv:read', label: 'CCTV · Read', description: 'View camera streams and clips' },
];

interface ApiTokenDTO {
  id: string;
  name: string;
  prefix: string;
  scopes: string[] | null;
  environment: Environment;
  status: TokenStatus;
  rate_limit_tier: string;
  last_used_at: string | null;
  last_used_ip: string | null;
  usage_count: number;
  expires_at: string | null;
  created_at: string;
}

interface CreateApiTokenResponse extends ApiTokenDTO {
  token: string;
}

interface OAuthClientDTO {
  id: string;
  tenant_id?: string | null;
  client_id: string;
  name: string;
  description?: string;
  redirect_uris: string[] | null;
  grant_types: string[] | null;
  scopes: string[] | null;
  rate_limit_tier: string;
  status: string;
  created_at: string;
}

interface CreateOAuthClientResponse extends OAuthClientDTO {
  client_secret: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function parseList(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function copyToClipboard(value: string, successMsg: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast(successMsg, 'success');
  } catch {
    toast('Copy failed', 'error');
  }
}

export function ApiTokensPage() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();

  const [tokens, setTokens] = useState<ApiTokenDTO[]>([]);
  const [clients, setClients] = useState<OAuthClientDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreateToken, setShowCreateToken] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [issuedToken, setIssuedToken] = useState<CreateApiTokenResponse | null>(null);
  const [issuedClient, setIssuedClient] = useState<CreateOAuthClientResponse | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [t1, c1] = await Promise.all([
        apiFetch<ApiTokenDTO[]>('/api/v1/auth/api-tokens'),
        apiFetch<OAuthClientDTO[]>('/api/v1/auth/oauth-clients'),
      ]);
      setTokens(Array.isArray(t1) ? t1 : []);
      setClients(Array.isArray(c1) ? c1 : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Load failed';
      toast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRevokeToken = async (id: string) => {
    if (!confirm(t('apiTokens.confirmRevokeToken', 'Revoke this token? Any integration using it will stop working immediately.'))) return;
    try {
      await apiFetch(`/api/v1/auth/api-tokens/${id}`, { method: 'DELETE' });
      toast(t('apiTokens.tokenRevoked', 'Token revoked'), 'success');
      fetchAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Revoke failed', 'error');
    }
  };

  const handleRevokeClient = async (id: string) => {
    if (!confirm(t('apiTokens.confirmRevokeClient', 'Revoke this OAuth client? All tokens issued by it will stop working immediately.'))) return;
    try {
      await apiFetch(`/api/v1/auth/oauth-clients/${id}`, { method: 'DELETE' });
      toast(t('apiTokens.clientRevoked', 'Client revoked'), 'success');
      fetchAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Revoke failed', 'error');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 space-y-4 p-6 pb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} data-testid="settings-button-back">
            <ArrowLeft size={16} />
          </Button>
          <div className="flex-1">
            <h1 className="text-[18px] font-semibold text-foreground">{t('apiTokens.title', 'API Integration')}</h1>
            <p className="text-[13px] text-muted-foreground">
              {t('apiTokens.description', 'Manage OAuth clients and long-lived API tokens for third-party integrations')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(API_DOCS_URL, '_blank', 'noopener,noreferrer')}
            data-testid="settings-button-api-docs"
          >
            <BookOpen size={14} className="mr-1.5" />
            {t('apiTokens.apiDocs', 'API Documentation')}
          </Button>
        </div>

        <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[13px] text-amber-200">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <div>
            <strong className="block">{t('apiTokens.warningTitle', 'Restricted feature')}</strong>
            <p className="text-[12px] text-amber-100/80">
              {t(
                'apiTokens.warningBody',
                'API tokens grant programmatic access to your tenant data. Share them only with integrations you trust and rotate them regularly.',
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6">
        <Tabs defaultValue="tokens" className="flex min-h-0 flex-1 flex-col">
          <TabsList variant="line" className="border-b border-border mb-4 shrink-0">
            <TabsTrigger value="tokens" className="gap-1.5 text-[13px]" data-testid="settings-tab-api-tokens">
              <KeyRound size={14} />
              {t('apiTokens.tabs.tokens', 'API Tokens')}
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-1.5 text-[13px]" data-testid="settings-tab-oauth-clients">
              <ShieldAlert size={14} />
              {t('apiTokens.tabs.clients', 'OAuth Clients')}
            </TabsTrigger>
          </TabsList>

          {/* ─── Tokens tab ─────────────────────────────────────── */}
          <TabsContent value="tokens" className="min-h-0 flex-1 overflow-auto">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-semibold text-foreground">{t('apiTokens.tokensTitle', 'API Tokens')}</h2>
                <p className="text-[12px] text-muted-foreground">
                  {t('apiTokens.tokensSubtitle', 'Long-lived bearer tokens for server-to-server calls. Last used updates the first time a token authenticates.')}
                </p>
              </div>
              <Button size="sm" onClick={() => setShowCreateToken(true)} data-testid="settings-button-create-token">
                <Plus size={14} className="mr-1.5" />
                {t('apiTokens.createToken', 'New Token')}
              </Button>
            </div>
            <div>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#3B82F6]/30 border-t-[#3B82F6]" />
                  </div>
                ) : tokens.length === 0 ? (
                  <EmptyState
                    icon={KeyRound}
                    title={t('apiTokens.emptyTokensTitle', 'No API tokens yet')}
                    description={t('apiTokens.emptyTokensDesc', 'Create a token to give an integration programmatic access.')}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]" data-testid="settings-table-tokens">
                      <thead className="text-left text-[12px] text-muted-foreground">
                        <tr className="border-b border-border">
                          <th className="py-2 pr-3 font-medium">{t('apiTokens.col.name', 'Name')}</th>
                          <th className="py-2 pr-3 font-medium">{t('apiTokens.col.prefix', 'Prefix')}</th>
                          <th className="py-2 pr-3 font-medium">{t('apiTokens.col.env', 'Env')}</th>
                          <th className="py-2 pr-3 font-medium">{t('apiTokens.col.status', 'Status')}</th>
                          <th className="py-2 pr-3 font-medium">{t('apiTokens.col.lastUsed', 'Last used')}</th>
                          <th className="py-2 pr-3 font-medium">{t('apiTokens.col.expires', 'Expires')}</th>
                          <th className="py-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {tokens.map((tok) => (
                          <tr key={tok.id} className="border-b border-border/50" data-testid={`settings-row-token-${tok.id}`}>
                            <td className="py-2 pr-3 font-medium">{tok.name}</td>
                            <td className="py-2 pr-3 font-mono text-[12px] text-muted-foreground">{tok.prefix}…</td>
                            <td className="py-2 pr-3">
                              <Badge variant={tok.environment === 'live' ? 'default' : 'outline'}>{tok.environment}</Badge>
                            </td>
                            <td className="py-2 pr-3">
                              <Badge variant={tok.status === 'active' ? 'default' : 'destructive'}>{tok.status}</Badge>
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">{formatDate(tok.last_used_at)}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{formatDate(tok.expires_at)}</td>
                            <td className="py-2 text-right">
                              {tok.status === 'active' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRevokeToken(tok.id)}
                                  data-testid={`settings-button-revoke-token-${tok.id}`}
                                >
                                  <Trash2 size={14} className="mr-1" />
                                  {t('apiTokens.revoke', 'Revoke')}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </TabsContent>

          {/* ─── Clients tab ────────────────────────────────────── */}
          <TabsContent value="clients" className="min-h-0 flex-1 overflow-auto">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-semibold text-foreground">{t('apiTokens.clientsTitle', 'OAuth Clients')}</h2>
                <p className="text-[12px] text-muted-foreground">
                  {t('apiTokens.clientsSubtitle', 'OAuth 2.0 clients for the client_credentials grant. Exchange a client_id + client_secret for a short-lived access token.')}
                </p>
              </div>
              <Button size="sm" onClick={() => setShowCreateClient(true)} data-testid="settings-button-create-client">
                <Plus size={14} className="mr-1.5" />
                {t('apiTokens.createClient', 'New Client')}
              </Button>
            </div>
            <div>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#3B82F6]/30 border-t-[#3B82F6]" />
                  </div>
                ) : clients.length === 0 ? (
                  <EmptyState
                    icon={KeyRound}
                    title={t('apiTokens.emptyClientsTitle', 'No OAuth clients yet')}
                    description={t('apiTokens.emptyClientsDesc', 'Create an OAuth client for server-to-server integrations.')}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]" data-testid="settings-table-clients">
                      <thead className="text-left text-[12px] text-muted-foreground">
                        <tr className="border-b border-border">
                          <th className="py-2 pr-3 font-medium">{t('apiTokens.col.name', 'Name')}</th>
                          <th className="py-2 pr-3 font-medium">{t('apiTokens.col.clientId', 'Client ID')}</th>
                          <th className="py-2 pr-3 font-medium">{t('apiTokens.col.grants', 'Grants')}</th>
                          <th className="py-2 pr-3 font-medium">{t('apiTokens.col.status', 'Status')}</th>
                          <th className="py-2 pr-3 font-medium">{t('apiTokens.col.created', 'Created')}</th>
                          <th className="py-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {clients.map((c) => (
                          <tr key={c.id} className="border-b border-border/50" data-testid={`settings-row-client-${c.id}`}>
                            <td className="py-2 pr-3 font-medium">{c.name}</td>
                            <td className="py-2 pr-3 font-mono text-[12px] text-muted-foreground">{c.client_id}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{(c.grant_types ?? []).join(', ')}</td>
                            <td className="py-2 pr-3">
                              <Badge variant={c.status === 'active' ? 'default' : 'destructive'}>{c.status}</Badge>
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">{formatDate(c.created_at)}</td>
                            <td className="py-2 text-right">
                              {c.status === 'active' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRevokeClient(c.id)}
                                  data-testid={`settings-button-revoke-client-${c.id}`}
                                >
                                  <Trash2 size={14} className="mr-1" />
                                  {t('apiTokens.revoke', 'Revoke')}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Token modal */}
      <CreateTokenModal
        open={showCreateToken}
        onOpenChange={setShowCreateToken}
        onCreated={(resp) => {
          setShowCreateToken(false);
          setIssuedToken(resp);
          fetchAll();
        }}
      />

      {/* Create Client modal */}
      <CreateClientModal
        open={showCreateClient}
        onOpenChange={setShowCreateClient}
        onCreated={(resp) => {
          setShowCreateClient(false);
          setIssuedClient(resp);
          fetchAll();
        }}
      />

      {/* Issued Token — shown ONCE */}
      <AppModal
        open={!!issuedToken}
        onOpenChange={(open) => !open && setIssuedToken(null)}
        title={t('apiTokens.tokenIssuedTitle', 'Copy your API token')}
        size="md"
      >
        <div className="space-y-3 text-[13px]">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
            <strong className="block">{t('apiTokens.saveNow', 'Save this token now')}</strong>
            <p className="text-[12px] text-amber-100/80">
              {t('apiTokens.saveNowBody', 'This is the only time the raw token will be shown. If you lose it, revoke it and create a new one.')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="block flex-1 overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-[12px]">
              {issuedToken?.token ?? ''}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => issuedToken && copyToClipboard(issuedToken.token, t('apiTokens.copied', 'Copied'))}
              data-testid="settings-button-copy-token"
            >
              <Copy size={14} />
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setIssuedToken(null)} data-testid="settings-button-close-token">
              {t('apiTokens.done', 'Done')}
            </Button>
          </div>
        </div>
      </AppModal>

      {/* Issued Client Secret — shown ONCE */}
      <AppModal
        open={!!issuedClient}
        onOpenChange={(open) => !open && setIssuedClient(null)}
        title={t('apiTokens.clientIssuedTitle', 'Copy your client credentials')}
        size="md"
      >
        <div className="space-y-3 text-[13px]">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
            <strong className="block">{t('apiTokens.saveNow', 'Save this token now')}</strong>
            <p className="text-[12px] text-amber-100/80">
              {t('apiTokens.clientSaveNowBody', 'The client_secret will not be shown again. Store it in your integration securely.')}
            </p>
          </div>
          <div>
            <Label className="text-[12px] text-muted-foreground">client_id</Label>
            <div className="flex items-center gap-2">
              <code className="block flex-1 overflow-x-auto rounded-md border border-border bg-background p-2 font-mono text-[12px]">
                {issuedClient?.client_id ?? ''}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => issuedClient && copyToClipboard(issuedClient.client_id, t('apiTokens.copied', 'Copied'))}
              >
                <Copy size={14} />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-[12px] text-muted-foreground">client_secret</Label>
            <div className="flex items-center gap-2">
              <code className="block flex-1 overflow-x-auto rounded-md border border-border bg-background p-2 font-mono text-[12px]">
                {issuedClient?.client_secret ?? ''}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => issuedClient && copyToClipboard(issuedClient.client_secret, t('apiTokens.copied', 'Copied'))}
                data-testid="settings-button-copy-client-secret"
              >
                <Copy size={14} />
              </Button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setIssuedClient(null)} data-testid="settings-button-close-client">
              {t('apiTokens.done', 'Done')}
            </Button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}

// ─── Create Token Modal ────────────────────────────────────────────────────────

interface CreateTokenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (resp: CreateApiTokenResponse) => void;
}

type ExpiryOption = 'never' | '30d' | '90d' | '1y' | 'custom';

function computeExpiresAt(option: ExpiryOption, customDate: string): string | null {
  if (option === 'never') return null;
  if (option === 'custom') {
    if (!customDate) return null;
    // yyyy-MM-dd → end-of-day UTC so the token stays valid through the chosen date.
    const d = new Date(`${customDate}T23:59:59Z`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const now = new Date();
  const days = option === '30d' ? 30 : option === '90d' ? 90 : 365;
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString();
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function CreateTokenModal({ open, onOpenChange, onCreated }: CreateTokenModalProps) {
  const { t } = useTranslation('settings');
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<Environment>('live');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [ipWhitelist, setIpWhitelist] = useState('');
  const [expiryOption, setExpiryOption] = useState<ExpiryOption>('never');
  const [customExpiry, setCustomExpiry] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const scopeOptions: MultiselectOption[] = AVAILABLE_SCOPES.map((s) => ({
    value: s.value,
    label: s.label,
    description: s.description,
  }));

  const reset = () => {
    setName('');
    setEnvironment('live');
    setSelectedScopes([]);
    setIpWhitelist('');
    setExpiryOption('never');
    setCustomExpiry('');
  };

  useEffect(() => {
    if (open) reset();
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast(t('apiTokens.nameRequired', 'Name is required'), 'error');
      return;
    }
    if (expiryOption === 'custom' && !customExpiry) {
      toast(t('apiTokens.expiryRequired', 'Pick an expiry date or choose Never'), 'error');
      return;
    }
    const expiresAt = computeExpiresAt(expiryOption, customExpiry);
    setSaving(true);
    try {
      const resp = await apiFetch<CreateApiTokenResponse>('/api/v1/auth/api-tokens', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          environment,
          scopes: selectedScopes,
          ip_whitelist: parseList(ipWhitelist),
          expires_at: expiresAt,
        }),
      });
      onCreated(resp);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Create failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange} title={t('apiTokens.createTokenTitle', 'Create API Token')} size="md">
      <div className="space-y-3 text-[13px]">
        <div>
          <Label htmlFor="token-name">{t('apiTokens.col.name', 'Name')}</Label>
          <Input
            id="token-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('apiTokens.namePlaceholder', 'e.g. Zapier integration')}
            data-testid="settings-input-token-name"
          />
        </div>
        <div>
          <Label htmlFor="token-env">{t('apiTokens.col.env', 'Environment')}</Label>
          <select
            id="token-env"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as Environment)}
            className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-[13px]"
            data-testid="settings-input-token-env"
          >
            <option value="live">live</option>
            <option value="test">test</option>
          </select>
        </div>
        <div>
          <Label htmlFor="token-scopes">{t('apiTokens.scopes', 'Scopes')}</Label>
          <div data-testid="settings-input-token-scopes">
            <Multiselect
              options={scopeOptions}
              values={selectedScopes}
              onValuesChange={setSelectedScopes}
              placeholder={t('apiTokens.scopesPlaceholder', 'Select scopes (leave empty for full access)')}
              searchPlaceholder={t('apiTokens.scopesSearch', 'Search scopes…')}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('apiTokens.scopesHint', 'Leave empty for full access. Pick only what the integration needs.')}
          </p>
        </div>
        <div>
          <Label htmlFor="token-ips">{t('apiTokens.ipWhitelist', 'IP whitelist')}</Label>
          <Textarea
            id="token-ips"
            value={ipWhitelist}
            onChange={(e) => setIpWhitelist(e.target.value)}
            placeholder="203.0.113.10, 203.0.113.11"
            rows={2}
            data-testid="settings-input-token-ips"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('apiTokens.ipHint', 'Optional. Restrict this token to specific source IPs.')}
          </p>
        </div>
        <div>
          <Label htmlFor="token-expiry">{t('apiTokens.expiry', 'Expiration')}</Label>
          <select
            id="token-expiry"
            value={expiryOption}
            onChange={(e) => setExpiryOption(e.target.value as ExpiryOption)}
            className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-[13px]"
            data-testid="settings-input-token-expiry"
          >
            <option value="never">{t('apiTokens.expiry.never', 'Never (permanent token)')}</option>
            <option value="30d">{t('apiTokens.expiry.30d', 'In 30 days')}</option>
            <option value="90d">{t('apiTokens.expiry.90d', 'In 90 days')}</option>
            <option value="1y">{t('apiTokens.expiry.1y', 'In 1 year')}</option>
            <option value="custom">{t('apiTokens.expiry.custom', 'Custom date')}</option>
          </select>
          {expiryOption === 'custom' && (
            <div className="mt-2" data-testid="settings-input-token-expiry-custom">
              <DatePicker
                value={customExpiry || null}
                onChange={(v) => setCustomExpiry(v ?? '')}
                min={todayYmd()}
                placeholder={t('apiTokens.expiry.pick', 'Select expiry date')}
              />
            </div>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {expiryOption === 'never'
              ? t('apiTokens.expiryHintNever', 'Permanent tokens never expire — rotate them manually when needed.')
              : t('apiTokens.expiryHint', 'Token will stop working automatically after the chosen date.')}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('apiTokens.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={saving} data-testid="settings-button-submit-token">
            {saving ? t('apiTokens.creating', 'Creating…') : t('apiTokens.create', 'Create')}
          </Button>
        </div>
      </div>
    </AppModal>
  );
}

// ─── Create Client Modal ───────────────────────────────────────────────────────

interface CreateClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (resp: CreateOAuthClientResponse) => void;
}

function CreateClientModal({ open, onOpenChange, onCreated }: CreateClientModalProps) {
  const { t } = useTranslation('settings');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [redirectUris, setRedirectUris] = useState('');
  const [saving, setSaving] = useState(false);

  const scopeOptions: MultiselectOption[] = AVAILABLE_SCOPES.map((s) => ({
    value: s.value,
    label: s.label,
    description: s.description,
  }));

  const reset = () => {
    setName('');
    setDescription('');
    setSelectedScopes([]);
    setRedirectUris('');
  };

  useEffect(() => {
    if (open) reset();
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast(t('apiTokens.nameRequired', 'Name is required'), 'error');
      return;
    }
    setSaving(true);
    try {
      const resp = await apiFetch<CreateOAuthClientResponse>('/api/v1/auth/oauth-clients', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          scopes: selectedScopes,
          redirect_uris: parseList(redirectUris),
          grant_types: ['client_credentials'],
        }),
      });
      onCreated(resp);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Create failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange} title={t('apiTokens.createClientTitle', 'Create OAuth Client')} size="md">
      <div className="space-y-3 text-[13px]">
        <div>
          <Label htmlFor="client-name">{t('apiTokens.col.name', 'Name')}</Label>
          <Input
            id="client-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('apiTokens.clientNamePlaceholder', 'e.g. Partner billing system')}
            data-testid="settings-input-client-name"
          />
        </div>
        <div>
          <Label htmlFor="client-desc">{t('apiTokens.description', 'Description')}</Label>
          <Textarea
            id="client-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            data-testid="settings-input-client-desc"
          />
        </div>
        <div>
          <Label htmlFor="client-scopes">{t('apiTokens.scopes', 'Scopes')}</Label>
          <div data-testid="settings-input-client-scopes">
            <Multiselect
              options={scopeOptions}
              values={selectedScopes}
              onValuesChange={setSelectedScopes}
              placeholder={t('apiTokens.scopesPlaceholder', 'Select scopes (leave empty for full access)')}
              searchPlaceholder={t('apiTokens.scopesSearch', 'Search scopes…')}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="client-uris">{t('apiTokens.redirectUris', 'Redirect URIs')}</Label>
          <Textarea
            id="client-uris"
            value={redirectUris}
            onChange={(e) => setRedirectUris(e.target.value)}
            rows={2}
            placeholder="https://partner.example.com/callback"
            data-testid="settings-input-client-uris"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('apiTokens.redirectHint', 'Only needed for authorization-code flow. Optional for client_credentials.')}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('apiTokens.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={saving} data-testid="settings-button-submit-client">
            {saving ? t('apiTokens.creating', 'Creating…') : t('apiTokens.create', 'Create')}
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
