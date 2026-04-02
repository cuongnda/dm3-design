import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { createCompany, type CreateCompanyResponse } from '@/lib/api';
import { Button, Input, Select, SelectOption, Label } from '@dm3/ui';

const plans = ['trial', 'starter', 'professional', 'enterprise'];

export function CreateCompanyPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CreateCompanyResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    name: '',
    code: '',
    email: '',
    plan: 'starter',
    address: '',
    phone: '',
    max_devices: 50,
    max_users: 20,
  });

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await createCompany(form);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create company');
    } finally {
      setLoading(false);
    }
  };

  const copyCredentials = () => {
    if (!result) return;
    navigator.clipboard.writeText(`Email: ${result.credentials.email}\nPassword: ${result.credentials.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Success view
  if (result) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-12">
        <div className="border border-border rounded-lg p-6 bg-card">
          <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
            <Check size={24} className="text-success" />
          </div>
          <h2 className="text-[18px] font-semibold text-foreground text-center mb-1">Company Created</h2>
          <p className="text-[13px] text-muted-foreground text-center mb-6">
            <span className="text-foreground font-medium">{result.company.name}</span> has been set up successfully.
          </p>

          <div className="bg-background border border-operate/30 rounded-md p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-operate font-medium">{t('createCompany.credentials')}</span>
              <Button variant="ghost" size="icon-xs" onClick={copyCredentials}>
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </Button>
            </div>
            <div className="space-y-1.5 text-[13px]">
              <div><span className="text-muted-foreground">Email:</span> <span data-testid="create-label-gen-email" className="text-foreground font-mono">{result.credentials.email}</span></div>
              <div><span className="text-muted-foreground">Password:</span> <span data-testid="create-label-gen-password" className="text-foreground font-mono">{result.credentials.password}</span></div>
            </div>
            <p className="text-[11px] text-warning mt-3">⚠ Save these credentials — the password won't be shown again.</p>
          </div>

          <Button className="w-full" onClick={() => navigate('/system/companies')}>
            Go to Companies
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <Button
        data-testid="create-button-back"
        variant="ghost"
        size="sm"
        onClick={() => navigate('/system/companies')}
        className="mb-4 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={15} /> Back to Companies
      </Button>
      <h1 className="text-[20px] font-semibold text-foreground mb-6">{t('createCompany.title')}</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div data-testid="create-text-error" className="px-3 py-2 bg-error/10 border border-error/30 rounded-md text-error text-[13px]">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>{t('createCompany.form.name')} *</Label>
            <Input data-testid="create-input-name" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Acme Corp" />
          </div>
          <div>
            <Label>{t('createCompany.form.code')} *</Label>
            <Input data-testid="create-input-code" required value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="ACME" />
          </div>
        </div>

        <div>
          <Label>{t('createCompany.form.managerEmail')} *</Label>
          <Input data-testid="create-input-email" required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="manager@acme.com" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>{t('createCompany.form.plan')}</Label>
            <Select data-testid="create-select-plan" value={form.plan} onChange={(e) => set('plan', e.target.value)}>
              {plans.map((p) => <SelectOption key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectOption>)}
            </Select>
          </div>
          <div>
            <Label>{t('createCompany.form.phone')}</Label>
            <Input data-testid="create-input-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+84..." />
          </div>
        </div>

        <div>
          <Label>{t('createCompany.form.address')}</Label>
          <Input data-testid="create-input-address" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="123 Main St" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>{t('createCompany.form.maxDevices')}</Label>
            <Input data-testid="create-input-maxDevices" type="number" value={form.max_devices} onChange={(e) => set('max_devices', +e.target.value)} />
          </div>
          <div>
            <Label>{t('createCompany.form.maxUsers')}</Label>
            <Input data-testid="create-input-maxUsers" type="number" value={form.max_users} onChange={(e) => set('max_users', +e.target.value)} />
          </div>
        </div>

        <Button data-testid="create-button-submit" type="submit" disabled={loading}>
          {loading ? 'Creating...' : t('createCompany.submit')}
        </Button>
      </form>
    </div>
  );
}
