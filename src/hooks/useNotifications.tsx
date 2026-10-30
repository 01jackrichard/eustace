import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { notificationService, type InAppNotification, type NotificationPermissionState } from '../services/notificationService';
import { isFirebaseConfigured } from '../lib/firebase';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

export interface NotificationContextType {
  permission: NotificationPermissionState;
  isSupported: boolean;
  isConfigured: boolean;
  loading: boolean;
  notifications: InAppNotification[];
  unreadCount: number;
  requestPermissionAndEnable: () => Promise<boolean>;
  disablePushNotifications: () => Promise<boolean>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  const toastedIdsRef = useRef<Map<string, number>>(new Map());

  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    notificationService.getPermissionState()
  );
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const isSupported = notificationService.isPushSupported();
  const isConfigured = isFirebaseConfigured();

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const items = await notificationService.fetchNotifications(user.id);
    setNotifications(items);
  }, [user]);

  const showToast = useCallback((title: string, body: string, url?: string, notifId?: string) => {
    const key = notifId || `${title}-${body}-${url}`;
    const now = Date.now();
    const lastSeen = toastedIdsRef.current.get(key);
    if (lastSeen && now - lastSeen < 6000) {
      return; // Deduplicate within 6 seconds
    }
    toastedIdsRef.current.set(key, now);

    // Clean old entries (older than 30s)
    for (const [k, time] of toastedIdsRef.current.entries()) {
      if (now - time > 30000) {
        toastedIdsRef.current.delete(k);
      }
    }

    // If currently on the exact same conversation or target URL, skip foreground toast
    if (url && locationRef.current === url) {
      return;
    }

    toast(
      (t) => (
        <div
          onClick={() => {
            toast.dismiss(t.id);
            if (url && url.startsWith('/')) {
              navigate(url);
            }
          }}
          className="cursor-pointer flex flex-col gap-1 py-1"
        >
          <span className="text-xs font-bold text-textMain">{title}</span>
          {body && <span className="text-xs text-textMuted line-clamp-2">{body}</span>}
        </div>
      ),
      {
        duration: 5000,
        position: 'top-right'
      }
    );
  }, [navigate]);

  useEffect(() => {
    if (user) {
      loadNotifications();

      // Check current browser permission dynamically
      const currentPerm = notificationService.getPermissionState();
      setPermission(currentPerm);

      // Auto-register/refresh device token if permission is already granted
      if (currentPerm === 'granted' && isConfigured && isSupported) {
        notificationService.registerDevice(user.id).catch((err) => {
          console.warn('[Eustace Notifications] Auto-registration error:', err);
        });
      }
    } else {
      setNotifications([]);
    }
  }, [user, isConfigured, isSupported, loadNotifications]);

  // 1. Supabase Realtime in-app notification subscription (instant 0ms latency foreground toasts)
  useEffect(() => {
    if (!user) return;

    // Use a unique channel name per session to prevent any collision across HMR or lifecycle mounts
    const channelName = `user_notifications_${user.id}_${Math.random().toString(36).substring(2, 9)}`;
    let channel: any = null;

    try {
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            const newNotif = payload.new as InAppNotification;
            if (newNotif) {
              showToast(
                newNotif.title,
                newNotif.body,
                newNotif.data?.url,
                newNotif.id
              );
              loadNotifications();
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('[Eustace Notifications] Supabase realtime subscription error:', err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (err) {
          console.warn('[Eustace Notifications] Error removing channel:', err);
        }
      }
    };
  }, [user?.id, showToast, loadNotifications]);

  // 2. Service Worker push broadcast listener (for Web Push arriving while tab is open)
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_NOTIFICATION') {
        const { title, body, url, data } = event.data;
        showToast(
          title || '🔔 Eustace',
          body || '',
          url || data?.url,
          data?.id || data?.notification_id
        );
        loadNotifications();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [showToast, loadNotifications]);

  // 3. Firebase SDK foreground listener
  useEffect(() => {
    if (!user || permission !== 'granted' || !isConfigured) return;

    let cleanup: (() => void) | null = null;

    notificationService.onForegroundMessage((payload) => {
      const title = payload.notification?.title || payload.data?.title || '🔔 Eustace';
      const body = payload.notification?.body || payload.data?.body || '';
      const url = payload.data?.url;
      const notifId = payload.data?.notification_id || payload.data?.id;

      showToast(title, body, url, notifId);
      loadNotifications();
    }).then((unsub) => {
      if (unsub) cleanup = unsub;
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [user, permission, isConfigured, showToast, loadNotifications]);

  const requestPermissionAndEnable = useCallback(async (): Promise<boolean> => {
    if (!user) {
      toast.error('You must be signed in to enable notifications');
      return false;
    }

    setLoading(true);
    try {
      const result = await notificationService.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        const registered = await notificationService.registerDevice(user.id);
        if (registered) {
          toast.success('Push notifications enabled for this device');
          return true;
        } else {
          toast.error('Could not register device token with server');
          return false;
        }
      } else if (result === 'denied') {
        toast.error('Notifications blocked by browser settings');
        return false;
      }
      return false;
    } catch {
      toast.error('Failed to enable push notifications');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const disablePushNotifications = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    setLoading(true);
    try {
      await notificationService.unregisterDevice(user.id);
      toast.success('Push notifications disabled for this device');
      return true;
    } catch {
      toast.error('Failed to disable notifications');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const markAsRead = useCallback(async (id: string) => {
    const success = await notificationService.markAsRead(id);
    if (success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    const success = await notificationService.markAllAsRead(user.id);
    if (success) {
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
    }
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const contextValue: NotificationContextType = {
    permission,
    isSupported,
    isConfigured,
    loading,
    notifications,
    unreadCount,
    requestPermissionAndEnable,
    disablePushNotifications,
    markAsRead,
    markAllAsRead,
    refreshNotifications: loadNotifications
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (context) return context;

  // Safe fallback if called outside of NotificationProvider
  return {
    permission: notificationService.getPermissionState(),
    isSupported: notificationService.isPushSupported(),
    isConfigured: isFirebaseConfigured(),
    loading: false,
    notifications: [],
    unreadCount: 0,
    requestPermissionAndEnable: async () => false,
    disablePushNotifications: async () => false,
    markAsRead: async () => {},
    markAllAsRead: async () => {},
    refreshNotifications: async () => {}
  };
}
