type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
    description?: string;
}

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
    for (const fn of listeners) fn();
}

export function toast(message: string, type: ToastType = 'info', description?: string) {
    const id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    toasts = [...toasts, { id, message, type, description }];
    emit();
    setTimeout(() => {
        toasts = toasts.filter((t) => t.id !== id);
        emit();
    }, 4000);
}

export function dismissToast(id: string) {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
}

export function subscribeToasts(cb: () => void) {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}

export function getToastsSnapshot(): ToastItem[] {
    return toasts;
}
