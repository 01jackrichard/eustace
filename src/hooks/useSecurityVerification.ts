import { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { verifyCurrentPassword, isEmailPasswordAccount } from '../lib/reauth';

export const VERIFICATION_LIFETIME_MS = 5 * 60 * 1000; // 5 minutes

export interface UseSecurityVerificationOptions {
  user: User | null;
  lifetimeMs?: number;
  onAutoLock?: () => void;
}

export function useSecurityVerification({
  user,
  lifetimeMs = VERIFICATION_LIFETIME_MS,
  onAutoLock
}: UseSecurityVerificationOptions) {
  const [isVerified, setIsVerified] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState<number | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  const prevUserIdRef = useRef<string | null>(user?.id ?? null);
  const onAutoLockRef = useRef(onAutoLock);
  onAutoLockRef.current = onAutoLock;

  const lock = useCallback(() => {
    setIsVerified(false);
    setVerifiedAt(null);
    setTimeRemaining(0);
    setVerificationError(null);
  }, []);

  // Re-lock if the authenticated user changes
  useEffect(() => {
    if (prevUserIdRef.current !== (user?.id ?? null)) {
      prevUserIdRef.current = user?.id ?? null;
      lock();
    }
  }, [user?.id, lock]);

  // Expiration countdown and automatic timeout
  useEffect(() => {
    if (!isVerified || !verifiedAt) {
      setTimeRemaining(0);
      return;
    }

    const checkExpiration = () => {
      const elapsed = Date.now() - verifiedAt;
      const remaining = Math.max(0, lifetimeMs - elapsed);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        lock();
        if (onAutoLockRef.current) {
          onAutoLockRef.current();
        }
      }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, 1000);
    return () => clearInterval(interval);
  }, [isVerified, verifiedAt, lifetimeMs, lock]);

  // Re-lock when browser tab loses focus or page is hidden
  useEffect(() => {
    if (!isVerified) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        lock();
        if (onAutoLockRef.current) {
          onAutoLockRef.current();
        }
      }
    };

    const handlePageHide = () => {
      lock();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isVerified, lock]);

  const verify = useCallback(async (password: string): Promise<boolean> => {
    if (!user) {
      setVerificationError('You must be signed in to perform this action.');
      return false;
    }

    setIsVerifying(true);
    setVerificationError(null);

    try {
      const result = await verifyCurrentPassword(user, password);
      if (result.success) {
        setIsVerified(true);
        setVerifiedAt(Date.now());
        setVerificationError(null);
        return true;
      } else {
        setVerificationError(result.error || 'Verification failed.');
        return false;
      }
    } catch (err: any) {
      setVerificationError(err?.message || 'Unexpected verification failure.');
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, [user]);

  const confirmOAuthIdentity = useCallback((): boolean => {
    if (!user) return false;
    // OAuth users verify via their active authenticated identity provider session
    setIsVerified(true);
    setVerifiedAt(Date.now());
    setVerificationError(null);
    return true;
  }, [user]);

  const isEmailAuth = isEmailPasswordAccount(user);

  return {
    isVerified,
    verifiedAt,
    timeRemaining,
    isVerifying,
    verificationError,
    isEmailAuth,
    verify,
    confirmOAuthIdentity,
    lock,
    clearError: () => setVerificationError(null)
  };
}
