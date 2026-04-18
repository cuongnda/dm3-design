import { create } from 'zustand';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  acknowledgeNotification,
  deleteNotification,
  type NotificationDTO,
} from '@/lib/api';

interface NotificationState {
  notifications: NotificationDTO[];
  unreadCount: number;
  loading: boolean;

  /** Fetch latest notifications + unread count from API */
  refresh: () => Promise<void>;

  /** Mark a single notification as read */
  markRead: (id: string) => Promise<void>;

  /** Mark all notifications as read */
  markAllRead: () => Promise<void>;

  /** Acknowledge a notification */
  acknowledge: (id: string) => Promise<void>;

  /** Delete a notification */
  remove: (id: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  refresh: async () => {
    try {
      const [notifRes, countRes] = await Promise.all([
        fetchNotifications(1, 20),
        fetchUnreadCount(),
      ]);
      set({
        notifications: notifRes.data ?? [],
        unreadCount: countRes.count,
      });
    } catch {
      // silently ignore — user may not be logged in yet
    }
  },

  markRead: async (id) => {
    try {
      const updated = await markNotificationRead(id);
      set((s) => ({
        notifications: s.notifications.map((n) => (n.id === id ? updated : n)),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
    } catch { /* ignore */ }
  },

  markAllRead: async () => {
    try {
      await markAllNotificationsRead();
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.status === 'unread' ? { ...n, status: 'read' as const, read_at: new Date().toISOString() } : n
        ),
        unreadCount: 0,
      }));
    } catch { /* ignore */ }
  },

  acknowledge: async (id) => {
    try {
      const updated = await acknowledgeNotification(id);
      set((s) => ({
        notifications: s.notifications.map((n) => (n.id === id ? updated : n)),
      }));
    } catch { /* ignore */ }
  },

  remove: async (id) => {
    try {
      await deleteNotification(id);
      set((s) => ({
        notifications: s.notifications.filter((n) => n.id !== id),
        unreadCount: s.notifications.find((n) => n.id === id)?.status === 'unread'
          ? Math.max(0, s.unreadCount - 1)
          : s.unreadCount,
      }));
    } catch { /* ignore */ }
  },
}));
