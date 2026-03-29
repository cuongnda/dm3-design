import React, { createContext, useContext, useState, useCallback } from 'react';
import { cn } from './lib/utils';

interface Toast {
  id: string;
  title: string;
  description?: string;
  type: 'info' | 'warning' | 'error' | 'success';
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, 'id'>) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { ...toast, id };
    
    setToasts(prev => [...prev, newToast]);

    // Auto-hide after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, toast.duration || 5000);
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, hideToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

function ToastContainer() {
  const context = useContext(ToastContext);
  if (!context) return null;
  
  const { toasts, hideToast } = context;

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={() => hideToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const typeStyles = {
    info: 'bg-[#1E3A5F] border-[#3B82F6] text-[#E0F2FE]',
    warning: 'bg-[#78350F] border-[#F59E0B] text-[#FEF3C7]',
    error: 'bg-[#7F1D1D] border-[#EF4444] text-[#FEE2E2]',
    success: 'bg-[#14532D] border-[#22C55E] text-[#D1FAE5]',
  };

  const iconMap = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '🚨',
    success: '✅',
  };

  return (
    <div className={cn(
      'min-w-80 p-4 rounded-lg border shadow-lg animate-in slide-in-from-right-full',
      typeStyles[toast.type]
    )}>
      <div className="flex items-start gap-3">
        <span className="text-lg">{iconMap[toast.type]}</span>
        <div className="flex-1">
          <div className="font-medium text-sm">{toast.title}</div>
          {toast.description && (
            <div className="text-xs mt-1 opacity-80">{toast.description}</div>
          )}
        </div>
        <button 
          onClick={onClose}
          className="text-xs opacity-60 hover:opacity-100 ml-2"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}