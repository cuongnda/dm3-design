export type NavStatus = 'ready' | 'beta' | 'setup' | 'coming-soon' | 'hidden';

export interface NavStatusMeta {
  label: string;
  description: string;
}

export const NAV_STATUS_META: Record<Exclude<NavStatus, 'ready' | 'hidden'>, NavStatusMeta> = {
  beta: {
    label: 'BETA',
    description: 'Available to use, API may change.',
  },
  setup: {
    label: 'SETUP',
    description: 'Requires configuration before use.',
  },
  'coming-soon': {
    label: 'SOON',
    description: 'Not yet available.',
  },
};

export function isWipVisible(): boolean {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return meta.env?.VITE_SHOW_WIP === 'true';
}

export function shouldRenderNavStatus(status: NavStatus): boolean {
  if (status === 'hidden') return isWipVisible();
  return true;
}

export function isNavClickable(status: NavStatus): boolean {
  return status !== 'coming-soon' && status !== 'hidden';
}
