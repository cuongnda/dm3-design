import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

interface PluginGuardProps {
  plugin: string;
  children: React.ReactNode;
}

export function PluginGuard({ plugin, children }: PluginGuardProps) {
  const enabledPlugins = useAuthStore((s) => s.enabledPlugins);
  if (!enabledPlugins?.includes(plugin)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
