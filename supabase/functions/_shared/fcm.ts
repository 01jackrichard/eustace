/**
 * Shared Firebase Cloud Messaging (FCM) v1 HTTP client for Supabase Edge Functions.
 * Supports modern Firebase Installation ID (FID) targeting and legacy registration tokens.
 * Uses native Web Crypto API (Deno compatible) to mint Google OAuth2 service account JWTs.
 */

interface GoogleServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getServiceAccount(): GoogleServiceAccount | null {
  const rawJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      return {
        projectId: parsed.project_id || parsed.projectId,
        clientEmail: parsed.client_email || parsed.clientEmail,
        privateKey: parsed.private_key || parsed.privateKey
      };
    } catch {
      console.error('[FCM] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON secret');
    }
  }

  const projectId = Deno.env.get('FIREBASE_PROJECT_ID');
  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL');
  const privateKey = Deno.env.get('FIREBASE_PRIVATE_KEY');

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n')
    };
  }

  return null;
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemClean = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
    .replace(/[\r\n\s]/g, '');

  const binaryDer = Uint8Array.from(atob(pemClean), c => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );
}

/**
 * Mint Google OAuth2 access token for FCM
 */
export async function getGoogleAccessToken(): Promise<{ token: string; projectId: string } | null> {
  const sa = getServiceAccount();
  if (!sa) {
    console.warn('[FCM] Firebase service account credentials not configured in Edge Function environment.');
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > nowSec + 60) {
    return { token: cachedAccessToken.token, projectId: sa.projectId };
  }

  try {
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: sa.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: nowSec + 3600,
      iat: nowSec
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    const privateKey = await importPrivateKey(sa.privateKey);
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      new TextEncoder().encode(unsignedToken)
    );

    const signedJwt = `${unsignedToken}.${arrayBufferToBase64Url(signature)}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signedJwt
      })
    });

    if (!tokenRes.ok) {
      console.error('[FCM] Failed to exchange Google OAuth assertion for access token:', tokenRes.status);
      return null;
    }

    const tokenData = await tokenRes.json();
    cachedAccessToken = {
      token: tokenData.access_token,
      expiresAt: nowSec + (tokenData.expires_in || 3600)
    };

    return { token: cachedAccessToken.token, projectId: sa.projectId };
  } catch (err: any) {
    console.error('[FCM] Error generating Google OAuth access token:', err.message || err);
    return null;
  }
}

export interface FcmSendOptions {
  token: string;
  tokenType?: 'fid' | 'token';
  title: string;
  body: string;
  url?: string;
  data?: Record<string, string>;
}

export interface FcmSendResult {
  success: boolean;
  isUnregistered?: boolean;
  error?: string;
}

/**
 * Send FCM message to a device targeting FID or legacy registration token via HTTP v1 API
 */
export async function sendFcmMessage(options: FcmSendOptions): Promise<FcmSendResult> {
  const auth = await getGoogleAccessToken();
  if (!auth) {
    return { success: false, error: 'Firebase server credentials unavailable' };
  }

  const { token: accessToken, projectId } = auth;
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const stringData: Record<string, string> = {
    url: options.url || '/dashboard',
    title: options.title,
    body: options.body,
    ...(options.data || {})
  };

  // Determine target field: 'fid' for Firebase Installation IDs vs 'token' for legacy tokens
  const isFidTarget =
    options.tokenType === 'fid' ||
    (Boolean(options.token) && options.token.length === 22 && !options.token.includes(':'));

  const targetPayload = isFidTarget
    ? { fid: options.token }
    : { token: options.token };

  const messagePayload = {
    message: {
      ...targetPayload,
      notification: {
        title: options.title,
        body: options.body
      },
      data: stringData,
      webpush: {
        notification: {
          title: options.title,
          body: options.body,
          icon: '/pwa-192x192.png',
          badge: '/favicon.png'
        },
        fcm_options: {
          link: options.url || '/dashboard'
        }
      }
    }
  };

  try {
    const res = await fetch(fcmUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(messagePayload)
    });

    if (res.ok) {
      return { success: true };
    }

    const errJson = await res.json().catch(() => ({}));
    const errorCode = errJson?.error?.status || errJson?.error?.details?.[0]?.errorCode;

    if (
      res.status === 404 ||
      errorCode === 'UNREGISTERED' ||
      errorCode === 'NOT_FOUND' ||
      errJson?.error?.message?.includes('registration token') ||
      errJson?.error?.message?.includes('installation')
    ) {
      return { success: false, isUnregistered: true, error: 'Target unregistered or expired' };
    }

    return {
      success: false,
      error: `HTTP ${res.status}`
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error during FCM dispatch' };
  }
}
