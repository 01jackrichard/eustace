/* eslint-disable no-undef */
/**
 * Eustace Firebase Cloud Messaging & Web Push Service Worker
 * Handles background push notifications, click navigation to internal routes,
 * and multi-device push delivery with URL sanitization.
 */

// Safe internal route sanitizer preventing open redirect or protocol injection
function sanitizeInternalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '/dashboard';
  const trimmed = rawUrl.trim();
  // Must start with '/' but never '//', '\\', or protocol-relative schemes
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return '/dashboard';
  }
  // Reject pseudo-protocols like /javascript:
  if (/^\/[a-zA-Z0-9_-]+:/.test(trimmed)) {
    return '/dashboard';
  }
  // Whitelist safe Eustace route prefixes
  const allowedPrefixes = [
    '/dashboard',
    '/tasks',
    '/calendar',
    '/notes',
    '/analytics',
    '/friends',
    '/chat',
    '/profile',
    '/settings',
    '/transcend'
  ];
  const isAllowed = allowedPrefixes.some(
    prefix => trimmed === prefix || trimmed.startsWith(prefix + '/') || trimmed.startsWith(prefix + '?')
  );
  return isAllowed ? trimmed : '/dashboard';
}

// Background Push Event Handler
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { notification: { title: '🔔 Eustace', body: event.data.text() } };
    }
  }

  // Support FCM HTTP v1 (notification/data), FCM Web (FCM_MSG), and direct Web Push payloads
  const notification = payload.notification || payload.FCM_MSG?.notification || (payload.data && payload.data.notification) || {};
  const data = payload.data || payload.FCM_MSG?.data || {};

  const title = notification.title || data.title || '🔔 Eustace';
  const body = notification.body || data.body || 'You have an update in Eustace.';
  const rawUrl = data.url || notification.click_action || '/dashboard';
  const targetUrl = sanitizeInternalUrl(rawUrl);

  const options = {
    body,
    icon: notification.icon || '/pwa-192x192.png',
    badge: '/favicon.png',
    tag: data.tag || data.id || `eustace-notification-${Date.now()}`,
    data: {
      url: targetUrl,
      timestamp: Date.now(),
      type: data.type || 'system',
      id: data.id || null
    },
    renotify: true,
    requireInteraction: false
  };

  const notifyPromise = self.registration.showNotification(title, options);

  // Broadcast push notification to all open clients/tabs so foreground listeners can display instant toasts
  const broadcastPromise = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clientList) => {
      for (const client of clientList) {
        client.postMessage({
          type: 'PUSH_NOTIFICATION',
          title,
          body,
          url: targetUrl,
          data: options.data
        });
      }
    })
    .catch((err) => {
      console.warn('[Eustace SW] Error broadcasting push to clients:', err);
    });

  event.waitUntil(Promise.all([notifyPromise, broadcastPromise]));
});

// Notification Click Handler: Focus active window or open internal route
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data ? event.notification.data.url : '/dashboard';
  const targetPath = sanitizeInternalUrl(rawUrl);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Find an existing client window to focus
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetPath);
          }
          return client;
        }
      }
      // If no window is open, open a new window safely
      if (clients.openWindow) {
        return clients.openWindow(targetPath);
      }
    })
  );
});

// Install & Activate Service Worker immediately
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
