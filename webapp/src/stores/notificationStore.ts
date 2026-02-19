import { create } from 'zustand';
import type { Alert } from '@/types/models';

interface NotificationState {
  notifications: Alert[];
  unreadCount: number;
  addNotification: (alert: Alert) => void;
  markAllRead: () => void;
  acknowledge: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [
    {
      id: '1',
      title: 'Door 5 forced open',
      description: 'Building A, Floor 3',
      severity: 'critical',
      timeAgo: '2m ago',
      source: 'access-control',
      acknowledged: false,
    },
    {
      id: '2',
      title: 'Intrusion alarm — Zone B',
      description: 'Perimeter sensor',
      severity: 'critical',
      timeAgo: '5m ago',
      source: 'intrusion',
      acknowledged: false,
    },
    {
      id: '3',
      title: 'NVR-02 storage at 90%',
      description: 'Camera storage',
      severity: 'warning',
      timeAgo: '12m ago',
      source: 'cctv',
      acknowledged: false,
    },
  ],
  unreadCount: 3,
  addNotification: (alert) =>
    set((s) => ({
      notifications: [alert, ...s.notifications],
      unreadCount: s.unreadCount + 1,
    })),
  markAllRead: () => set({ unreadCount: 0 }),
  acknowledge: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, acknowledged: true } : n
      ),
    })),
}));
