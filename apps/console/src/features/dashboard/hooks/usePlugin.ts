import { useAuthStore } from '@/stores/authStore';

/**
 * Reactive hook that returns true when the given plugin is enabled for the
 * current tenant.  Unlike `hasPlugin()` (which calls `getState()` and is
 * non-reactive), this selector re-renders the component whenever
 * `enabledPlugins` changes in the store.
 */
export function usePlugin(name: string): boolean {
  return useAuthStore((s) => s.enabledPlugins.includes(name));
}
