import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getToken, clearToken, apiFetch } from '@/lib/api';
import i18n from '@/i18n';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  initials: string;
}

interface MeResponse {
  id: string;
  email: string;
  name?: string | null;
  role?: string | null;
  company_id?: string | null;
  preferred_language?: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  enabledModules: string[];
  login: (user: User, enabledModules?: string[]) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      enabledModules: [],
      login: (user, enabledModules = []) => set({ user, isAuthenticated: true, enabledModules }),
      logout: () => {
        clearToken();
        set({ user: null, isAuthenticated: false, enabledModules: [] });
      },
      checkAuth: async () => {
        const token = getToken();
        if (!token) {
          set({ user: null, isAuthenticated: false });
          return;
        }
        try {
          const me = await apiFetch<MeResponse>('/api/v1/auth/me');
          const preferred = (me.preferred_language ?? '').split('-')[0]?.toLowerCase();
          const normalized = preferred === 'vi' ? 'vi' : 'en';
          localStorage.setItem('dm3-lang', normalized);
          i18n.changeLanguage(normalized);
          set({
            isAuthenticated: true,
            user: {
              id: me.id,
              name: me.name || me.email.split('@')[0],
              email: me.email,
              role: me.role || 'viewer',
              initials: (me.name || me.email).slice(0, 2).toUpperCase(),
            },
          });
        } catch {
          // apiFetch handles redirect on 401; just clear local state
          clearToken();
          set({ user: null, isAuthenticated: false });
        }
      },
    }),
    { name: 'dm3-auth' }
  )
);

export const hasModule = (moduleName: string): boolean => {
  const { enabledModules } = useAuthStore.getState();
  return enabledModules?.includes(moduleName) ?? false;
};
