import React, { useSyncExternalStore } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

interface Toast {
  id: string;
  title: string;
  description?: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

// ── Global state (module-level, no React dependency) ─────────

let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot(): Toast[] {
  return toasts;
}

export function showToast(opts: Omit<Toast, 'id'>) {
  const id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
  toasts = [...toasts, { ...opts, id }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 4000);
}

function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

// ── Hook (optional) ──────────────────────────────────────────

export function useToast() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { toasts: current, showToast, hideToast: dismiss };
}

// ── Styles (inline to avoid any Tailwind scanning issues) ────

const TYPE_STYLES: Record<Toast['type'], React.CSSProperties> = {
  success: { background: '#14532D', borderColor: '#22C55E', color: '#D1FAE5' },
  error:   { background: '#7F1D1D', borderColor: '#EF4444', color: '#FEE2E2' },
  warning: { background: '#78350F', borderColor: '#F59E0B', color: '#FEF3C7' },
  info:    { background: '#1E3A5F', borderColor: '#3B82F6', color: '#E0F2FE' },
};

const ICON: Record<Toast['type'], LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const ICON_COLOR: Record<Toast['type'], string> = {
  success: '#22C55E',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
};

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  zIndex: 99999,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  pointerEvents: 'none',
};

const itemStyle: React.CSSProperties = {
  minWidth: 320,
  maxWidth: 420,
  padding: '12px 16px',
  borderRadius: 8,
  border: '1px solid',
  boxShadow: '0 4px 12px rgba(0,0,0,.3)',
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  animation: 'dm3-toast-in .3s ease-out',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
};

// ── Components ───────────────────────────────────────────────

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const colors = TYPE_STYLES[toast.type];
  const Icon = ICON[toast.type];
  return (
    <div style={{ ...itemStyle, ...colors }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, color: ICON_COLOR[toast.type] }}>
        <Icon size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{toast.title}</div>
        {toast.description && (
          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>{toast.description}</div>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6, padding: 0, display: 'inline-flex' }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function ToastContainer() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (list.length === 0) return null;
  return (
    <div style={containerStyle}>
      {list.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ToastContainer />
      <style>{`@keyframes dm3-toast-in { from { opacity:0; transform:translateX(100%); } to { opacity:1; transform:translateX(0); } }`}</style>
    </>
  );
}
