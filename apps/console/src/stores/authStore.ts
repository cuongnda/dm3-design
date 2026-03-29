import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearToken } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  initials: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (user) => set({ user, isAuthenticated: true }),
      logout: () => {
        clearToken();
        set({ user: null, isAuthenticated: false });
      },
    }),
    { name: 'dm3-auth' }
  )
);
