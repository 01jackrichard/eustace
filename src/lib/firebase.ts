import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';

// Frontend public Firebase Configuration from Vite environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const FIREBASE_VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

/**
 * Checks whether Firebase Push Notification client credentials are provided.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId &&
    FIREBASE_VAPID_KEY
  );
}

let app: FirebaseApp | null = null;
let messagingInstance: Messaging | null = null;
let hasLoggedConfigWarning = false;

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;

  if (!isFirebaseConfigured()) {
    if (!hasLoggedConfigWarning && import.meta.env.DEV) {
      console.info(
        '[Eustace Push Notifications] Firebase environment variables not fully configured. ' +
        'Push notifications will remain disabled until VITE_FIREBASE_* variables are set.'
      );
      hasLoggedConfigWarning = true;
    }
    return null;
  }

  if (!app) {
    const existingApps = getApps();
    app = existingApps.length > 0 ? existingApps[0] : initializeApp(firebaseConfig);
  }
  return app;
}

/**
 * Resolves Firebase Messaging instance asynchronously if supported by the browser.
 */
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  const currentApp = getFirebaseApp();
  if (!currentApp) return null;

  if (messagingInstance) return messagingInstance;

  try {
    const supported = await isSupported();
    if (supported) {
      messagingInstance = getMessaging(currentApp);
      return messagingInstance;
    }
  } catch (err) {
    console.warn('[Eustace Push Notifications] Firebase messaging is not supported in this environment:', err);
  }
  return null;
}
