import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { login as apiLogin, setToken } from '@/lib/api';
import { Eye, EyeOff } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('admin@duali.com');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await apiLogin(email, password);
      setToken(res.access_token, res.refresh_token);

      // Decode JWT payload for user info
      const payload = JSON.parse(atob(res.access_token.split('.')[1]));
      const role = payload.role || payload.roles?.[0] || 'user';
      login({
        id: payload.sub,
        name: payload.name || email.split('@')[0],
        email: payload.email || email,
        role,
        initials: (payload.name || email).slice(0, 2).toUpperCase(),
      });
      navigate(role === 'system_admin' ? '/system' : '/');
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-[#3B82F6] rotate-45 rounded-[6px]" />
          </div>
          <h1 className="text-[20px] font-semibold text-[#F8FAFC] tracking-tight">DUALL MASTER 3.0</h1>
          <p className="text-[13px] text-[#64748B] mt-1">Building Operating System</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-3 py-2 bg-[#7F1D1D]/20 border border-[#EF4444]/30 rounded-md text-[#EF4444] text-[13px]">
              {error}
            </div>
          )}
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/20"
            />
          </div>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-9 px-3 pr-10 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/20"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#94A3B8]"
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <label className="flex items-center gap-2 text-[12px] text-[#94A3B8]">
            <input type="checkbox" className="rounded border-[#334155]" />
            Remember this device
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-9 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-md text-[14px] font-medium transition-colors disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#334155]" />
            </div>
            <div className="relative flex justify-center text-[12px]">
              <span className="bg-[#0A0E1A] px-3 text-[#64748B]">or continue with</span>
            </div>
          </div>

          <button
            type="button"
            className="w-full h-9 bg-[#1E293B] hover:bg-[#334155] border border-[#334155] text-[#F8FAFC] rounded-md text-[13px] font-medium transition-colors"
          >
            🏢 Sign in with SSO
          </button>

          <div className="text-center mt-4">
            <a href="#" className="text-[12px] text-[#3B82F6] hover:underline">Forgot password?</a>
          </div>
        </form>

        {/* Footer */}
        <div className="mt-10 flex items-center justify-between text-[12px] text-[#64748B] border-t border-[#1E293B] pt-4">
          <span>Building: Landmark 81 ▾</span>
          <span>EN | VI</span>
        </div>
      </div>
    </div>
  );
}
