import { useEffect } from 'react';
import { useToast } from '@dm3/ui';

export function ToastListener() {
  const { showToast } = useToast();

  useEffect(() => {
    const handleToastEvent = (event: CustomEvent<{
      message: string;
      type: 'info' | 'warning' | 'error' | 'success';
      description?: string;
    }>) => {
      showToast({
        title: event.detail.message,
        type: event.detail.type,
        description: event.detail.description,
      });
    };

    // Listen for custom toast events from WebSocket hook
    window.addEventListener('dm3-toast', handleToastEvent as EventListener);

    return () => {
      window.removeEventListener('dm3-toast', handleToastEvent as EventListener);
    };
  }, [showToast]);

  return null; // This component doesn't render anything
}