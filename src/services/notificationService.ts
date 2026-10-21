import {
  getToken,
  deleteToken,
  onMessage,
  type MessagePayload
} from 'firebase/messaging';
import { getFirebaseMessaging, FIREBASE_VAPID_KEY, isFirebaseConfigured } from '../lib/firebase';
import { supabase } from '../lib/supabase';

const FCM_TOKEN_STORAGE_KEY = 'eustace_active_fcm_token';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface InAppNotification {
  id: string;
  user_id: string;
  type: 'task_reminder' | 'message' | 'friend_request' | 'friend_accepted' | 'streak' | 'system';
  title: string;
  body: string;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
}

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' | 'web' {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent.toLowerCase();
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'tablet';
  if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';

  let os = 'OS';
  if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return `${browser} on ${os}`;
}

export const notificationService = {
  /**
   * Check if the browser environment supports push notifications
   */
  isPushSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  },

  /**
   * Get current browser notification permission
   */
  getPermissionState(): NotificationPermissionState {
    if (!this.isPushSupported()) return 'unsupported';
    return Notification.permission as NotificationPermissionState;
  },

  /**
   * Request browser permission for notifications
   */
  async requestPermission(): Promise<NotificationPermissionState> {
    if (!this.isPushSupported()) return 'unsupported';
    try {
      const permission = await Notification.requestPermission();
      return permission as NotificationPermissionState;
    } catch (err) {
      console.warn('[Eustace Notifications] Error requesting permission:', err);
      return 'denied';
    }
  },

  /**
   * Register or retrieve the service worker registration
   */
  async getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

    try {
      let reg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (!reg) {
        reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/'
        });
      }
      return reg;
    } catch (err) {
      console.warn('[Eustace Notifications] Error registering push service worker:', err);
      return null;
    }
  },

  /**
   * Register this device with FCM via standard Web Push registration token
   */
  async registerDevice(userId: string): Promise<boolean> {
    if (!userId || !this.isPushSupported() || !isFirebaseConfigured()) return false;

    try {
      const messaging = await getFirebaseMessaging();
      if (!messaging) return false;

      const swRegistration = await this.getServiceWorkerRegistration();
      if (!swRegistration) return false;

      const token = await getToken(messaging, {
        vapidKey: FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swRegistration
      });

      if (!token) {
        console.warn('[Eustace Notifications] No FCM token returned by getToken()');
        return false;
      }

      const { error } = await supabase.rpc('register_notification_device', {
        p_fcm_token: token,
        p_device_type: getDeviceType(),
        p_device_name: getDeviceName(),
        p_token_type: 'token'
      });

      if (error) {
        console.warn('[Eustace Notifications] Failed to store device in database:', error);
        return false;
      }

      localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
      return true;
    } catch (err) {
      console.warn('[Eustace Notifications] Error registering device with FCM:', err);
      return false;
    }
  },

  /**
   * Deactivate this device's registration in Firebase and Supabase
   */
  async unregisterDevice(userId: string): Promise<boolean> {
    if (!userId) return false;

    const messaging = await getFirebaseMessaging();
    const token = localStorage.getItem(FCM_TOKEN_STORAGE_KEY);

    try {
      if (messaging) {
        await deleteToken(messaging);
      }
    } catch (err) {
      console.warn('[Eustace Notifications] Error calling deleteToken():', err);
    }

    if (token) {
      try {
        await supabase.rpc('unregister_notification_device', {
          p_fcm_token: token
        });
      } catch (err) {
        console.warn('[Eustace Notifications] Error deactivating device token:', err);
      }
      localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
    }
    return true;
  },

  /**
   * Subscribe to foreground notifications received while Eustace is open
   */
  async onForegroundMessage(handler: (payload: MessagePayload) => void): Promise<(() => void) | null> {
    if (!this.isPushSupported() || !isFirebaseConfigured()) return null;

    try {
      const messaging = await getFirebaseMessaging();
      if (!messaging) return null;

      return onMessage(messaging, (payload) => {
        handler(payload);
      });
    } catch (err) {
      console.warn('[Eustace Notifications] Could not attach foreground message handler:', err);
      return null;
    }
  },

  /**
   * Dispatch an event push notification via Supabase Edge Function
   */
  async sendNotificationTrigger(params: {
    recipientUserId: string;
    type: 'message' | 'friend_request' | 'friend_accepted' | 'task_reminder' | 'streak' | 'system';
    title: string;
    body: string;
    url?: string;
    data?: Record<string, any>;
  }): Promise<boolean> {
    if (!params.recipientUserId) return false;
    try {
      const { error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: params.recipientUserId,
          type: params.type,
          title: params.title,
          body: params.body,
          url: params.url || '/dashboard',
          data: params.data || {}
        }
      });
      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Fetch in-app notifications history
   */
  async fetchNotifications(userId: string, limit = 20): Promise<InAppNotification[]> {
    if (!userId) return [];
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('[Eustace Notifications] Failed to fetch notifications:', error);
        return [];
      }
      return (data || []) as InAppNotification[];
    } catch (err) {
      console.warn('[Eustace Notifications] Error fetching notifications:', err);
      return [];
    }
  },

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId);

      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Mark all unread notifications as read
   */
  async markAllAsRead(userId: string): Promise<boolean> {
    if (!userId) return false;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);

      return !error;
    } catch {
      return false;
    }
  }
};
