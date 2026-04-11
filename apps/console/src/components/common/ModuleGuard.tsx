import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

interface ModuleGuardProps {
  module: string;
  children: React.ReactNode;
}

export function ModuleGuard({ module, children }: ModuleGuardProps) {
  const enabledModules = useAuthStore((s) => s.enabledModules);
  if (!enabledModules?.includes(module)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
