import { useSyncExternalStore } from 'react';
import { subscribeToasts, getToastsSnapshot, dismissToast } from '@/lib/toast';

const TYPE_BG: Record<string, string> = {
    success: '#14532D',
    error: '#7F1D1D',
    warning: '#78350F',
    info: '#1E3A5F',
};
const TYPE_BORDER: Record<string, string> = {
    success: '#22C55E',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6',
};
const TYPE_TEXT: Record<string, string> = {
    success: '#D1FAE5',
    error: '#FEE2E2',
    warning: '#FEF3C7',
    info: '#E0F2FE',
};
const ICONS: Record<string, string> = {
    success: '\u2705',
    error: '\uD83D\uDEA8',
    warning: '\u26A0\uFE0F',
    info: '\u2139\uFE0F',
};

export function ToastContainer() {
    const toasts = useSyncExternalStore(subscribeToasts, getToastsSnapshot, getToastsSnapshot);

    if (toasts.length === 0) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 16,
                right: 16,
                zIndex: 99999,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                pointerEvents: 'none',
            }}
        >
            {toasts.map((t) => (
                <div
                    key={t.id}
                    style={{
                        minWidth: 320,
                        maxWidth: 420,
                        padding: '12px 16px',
                        borderRadius: 8,
                        border: `1px solid ${TYPE_BORDER[t.type] || TYPE_BORDER.info}`,
                        background: TYPE_BG[t.type] || TYPE_BG.info,
                        color: TYPE_TEXT[t.type] || TYPE_TEXT.info,
                        boxShadow: '0 4px 12px rgba(0,0,0,.3)',
                        pointerEvents: 'auto',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        animation: 'dm3ToastIn .3s ease-out',
                        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                    }}
                >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>
                        {ICONS[t.type] || ICONS.info}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{t.message}</div>
                        {t.description && (
                            <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>
                                {t.description}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => dismissToast(t.id)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'inherit',
                            cursor: 'pointer',
                            opacity: 0.6,
                            fontSize: 14,
                            padding: 0,
                        }}
                    >
                        ✕
                    </button>
                </div>
            ))}
            <style>{`@keyframes dm3ToastIn { from { opacity:0; transform:translateX(100%); } to { opacity:1; transform:translateX(0); } }`}</style>
        </div>
    );
}
