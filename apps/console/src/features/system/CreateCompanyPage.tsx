import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { createCompany, type CreateCompanyResponse } from '@/lib/api';

const plans = ['trial', 'starter', 'professional', 'enterprise'];

export function CreateCompanyPage() {
  const navigate = useNavigate();
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
        <div className="border border-[#1E293B] rounded-lg p-6 bg-[#111827]">
          <div className="w-12 h-12 rounded-full bg-[#22C55E]/10 flex items-center justify-center mx-auto mb-4">
            <Check size={24} className="text-[#22C55E]" />
          </div>
          <h2 className="text-[18px] font-semibold text-[#F8FAFC] text-center mb-1">Company Created</h2>
          <p className="text-[13px] text-[#64748B] text-center mb-6">
            <span className="text-[#F8FAFC] font-medium">{result.company.name}</span> has been set up successfully.
          </p>

          <div className="bg-[#0B1120] border border-[#F97316]/30 rounded-md p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-[#F97316] font-medium">Primary Manager Credentials</span>
              <button onClick={copyCredentials} className="text-[#94A3B8] hover:text-[#F8FAFC]">
                {copied ? <Check size={14} className="text-[#22C55E]" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="space-y-1.5 text-[13px]">
              <div><span className="text-[#64748B]">Email:</span> <span className="text-[#F8FAFC] font-mono">{result.credentials.email}</span></div>
              <div><span className="text-[#64748B]">Password:</span> <span className="text-[#F8FAFC] font-mono">{result.credentials.password}</span></div>
            </div>
            <p className="text-[11px] text-[#F59E0B] mt-3">⚠ Save these credentials — the password won't be shown again.</p>
          </div>

          <button
            onClick={() => navigate('/system/companies')}
            className="w-full h-9 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-md text-[13px] font-medium transition-colors"
          >
            Go to Companies
          </button>
        </div>
      </div>
    );
  }

  const inputCls = "w-full h-9 px-3 bg-[#0B1120] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] placeholder:text-[#475569] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]/20";
  const labelCls = "block text-[12px] text-[#94A3B8] mb-1";

  return (
    <div className="p-6 max-w-2xl">
      <button onClick={() => navigate('/system/companies')} className="flex items-center gap-1.5 text-[13px] text-[#94A3B8] hover:text-[#F8FAFC] mb-4 transition-colors">
        <ArrowLeft size={15} /> Back to Companies
      </button>
      <h1 className="text-[20px] font-semibold text-[#F8FAFC] mb-6">Create Company</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="px-3 py-2 bg-[#7F1D1D]/20 border border-[#EF4444]/30 rounded-md text-[#EF4444] text-[13px]">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Company Name *</label>
            <input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Acme Corp" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Company Code *</label>
            <input required value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="ACME" className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Primary Manager Email *</label>
          <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="manager@acme.com" className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Plan</label>
            <select value={form.plan} onChange={(e) => set('plan', e.target.value)} className={inputCls}>
              {plans.map((p) => <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+84..." className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Address</label>
          <input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="123 Main St" className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Max Devices</label>
            <input type="number" value={form.max_devices} onChange={(e) => set('max_devices', +e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Max Users</label>
            <input type="number" value={form.max_users} onChange={(e) => set('max_users', +e.target.value)} className={inputCls} />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="h-9 px-6 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-md text-[13px] font-medium transition-colors disabled:opacity-60"
        >
          {loading ? 'Creating...' : 'Create Company'}
        </button>
      </form>
    </div>
  );
}
