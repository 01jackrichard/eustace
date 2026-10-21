import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { notificationService, type InAppNotification, type NotificationPermissionState } from '../services/notificationService';
import { isFirebaseConfigured } from '../lib/firebase';
import toast from 'react-hot-toast';

export function useNotifications() {
  const { user } = useAuth();
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

  useEffect(() => {
    if (user) {
      loadNotifications();
    } else {
      setNotifications([]);
    }
  }, [user, loadNotifications]);

  // Synchronize foreground listener when user is logged in and permission granted
  useEffect(() => {
    if (!user || permission !== 'granted' || !isConfigured) return;

    let cleanup: (() => void) | null = null;

    notificationService.onForegroundMessage((payload) => {
      const title = payload.notification?.title || payload.data?.title || '🔔 Eustace';
      const body = payload.notification?.body || payload.data?.body || '';

      toast(
        (t) => (
          <div
            onClick={() => {
              toast.dismiss(t.id);
              const targetUrl = payload.data?.url;
              if (targetUrl && targetUrl.startsWith('/')) {
                window.location.href = targetUrl;
              }
            }}
            className="cursor-pointer flex flex-col gap-1 py-1"
          >
            <span className="text-xs font-bold text-textMain">{title}</span>
            {body && <span className="text-xs text-textMuted">{body}</span>}
          </div>
        ),
        {
          duration: 5000,
          position: 'top-right'
        }
      );

      loadNotifications();
    }).then((unsub) => {
      if (unsub) cleanup = unsub;
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [user, permission, isConfigured, loadNotifications]);

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

  return {
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
}
