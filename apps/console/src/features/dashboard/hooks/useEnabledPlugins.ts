import { useAuthStore } from '@/stores/authStore';

/**
 * Reactive selector that returns the full list of enabled plugin names for the
 * current tenant.
 */
export function useEnabledPlugins(): string[] {
  return useAuthStore((s) => s.enabledPlugins);
}

/**
 * Reactive selector that returns true when at least one of the provided plugin
 * names is present in the enabled plugins list.
 */
export function useAnyPlugin(names: string[]): boolean {
  return useAuthStore((s) => names.some((n) => s.enabledPlugins.includes(n)));
}
