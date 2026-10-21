import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';

// Resolve and sanitize Firebase API key to prevent subtle typos (e.g., '1' vs 'l')
const rawApiKey = (import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
const sanitizedApiKey = rawApiKey.includes('BM1G1pniSMPGX_g')
  ? rawApiKey.replace('BM1G1pniSMPGX_g', 'BMlG1pniSMPGX_g')
  : (rawApiKey || 'AIzaSyCCO-RJVtXiBNoyCUAyBMlG1pniSMPGX_g');

// Frontend public Firebase Configuration with production defaults
const firebaseConfig = {
  apiKey: sanitizedApiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'eustace-69e5a.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'eustace-69e5a',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'eustace-69e5a.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '400541492768',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:400541492768:web:c06f9a9359b519c79c3e45'
};

export const FIREBASE_VAPID_KEY =
  (import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim() ||
  'BKlJ0vZbAF1MuceCCz7YkxXgW-D3iGRcI5NzssHdZEyHLNK_WxXqhArYMjaEODQ8E6BGLjZweQ5baxniBCOQGI0';

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
