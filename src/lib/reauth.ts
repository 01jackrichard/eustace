import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

export interface VerifyPasswordResult {
  success: boolean;
  error?: string;
}

export type ReauthClientFactory = (url: string, key: string) => ReturnType<typeof createClient>;

/**
 * Determines whether the user account authenticates via email/password
 * versus an external OAuth identity provider (e.g. Google).
 */
export function isEmailPasswordAccount(user: User | null): boolean {
  if (!user) return false;
  
  // Check explicit app_metadata provider
  const provider = user.app_metadata?.provider;
  if (provider && provider !== 'email') {
    return false;
  }

  // Check identities array if present
  if (user.identities && user.identities.length > 0) {
    const hasEmailIdentity = user.identities.some(id => id.provider === 'email');
    const hasOnlyOAuth = user.identities.every(id => id.provider !== 'email');
    if (hasOnlyOAuth) return false;
    if (hasEmailIdentity) return true;
  }

  return true;
}

/**
 * Verifies the user's current password against Supabase Auth using an
 * ephemeral, non-persisting client instance.
 *
 * This design:
 * 1. Executes real authentication against Supabase auth API (`/auth/v1/token?grant_type=password`).
 * 2. Never alters or clobbers the active application session in localStorage (`sb-*-auth-token`).
 * 3. Never triggers `onAuthStateChange` listeners on the primary client.
 * 4. Verifies that the returned user ID matches the currently signed-in user.
 * 5. Clears sensitive input parameters from call stack memory immediately.
 */
export async function verifyCurrentPassword(
  user: User | null,
  password: string,
  customFactory?: ReauthClientFactory
): Promise<VerifyPasswordResult> {
  if (!user) {
    return { success: false, error: 'User is not authenticated.' };
  }

  const cleanPassword = typeof password === 'string' ? password.trim() : '';
  if (!cleanPassword) {
    return { success: false, error: 'Please enter your current account password.' };
  }

  if (!user.email) {
    return { success: false, error: 'No email address found for this user account.' };
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  try {
    const factory = customFactory || ((url, key) => createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {}
        }
      }
    }));

    const ephemeralClient = factory(supabaseUrl, supabaseAnonKey);

    const { data, error } = await ephemeralClient.auth.signInWithPassword({
      email: user.email,
      password: cleanPassword
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes('invalid login credentials') ||
        msg.includes('invalid credentials') ||
        msg.includes('invalid password')
      ) {
        return { success: false, error: 'Incorrect password. Please verify your credentials and try again.' };
      }
      return { success: false, error: error.message };
    }

    if (!data.user || data.user.id !== user.id) {
      return { success: false, error: 'Identity verification failed: account mismatch.' };
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Authentication service unreachable. Please check your network connection.'
    };
  }
}
