import { create } from 'zustand';

interface BreadcrumbStore {
  labels: Record<string, string>;
  setLabel: (id: string, name: string) => void;
  clearLabel: (id: string) => void;
}

export const useBreadcrumbStore = create<BreadcrumbStore>((set) => ({
  labels: {},
  setLabel: (id, name) =>
    set((s) => ({ labels: { ...s.labels, [id.toLowerCase()]: name } })),
  clearLabel: (id) =>
    set((s) => {
      const { [id.toLowerCase()]: _, ...rest } = s.labels;
      return { labels: rest };
    }),
}));
