import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
  expandedSections: Record<string, boolean>;
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSection: (key: string) => void;
  setSectionExpanded: (key: string, value: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      expandedSections: {},
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),
      toggleSection: (key) =>
        set((s) => ({
          expandedSections: { ...s.expandedSections, [key]: !s.expandedSections[key] },
        })),
      setSectionExpanded: (key, value) =>
        set((s) => ({
          expandedSections: { ...s.expandedSections, [key]: value },
        })),
    }),
    { name: 'dm3-theme' }
  )
);
