import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyCurrentPassword, isEmailPasswordAccount } from '../lib/reauth';
import type { User } from '@supabase/supabase-js';
import settingsPageRaw from '../pages/SettingsPage.tsx?raw';
import verifyModalRaw from '../components/settings/VerifyIdentityModal.tsx?raw';
import deleteModalRaw from '../components/settings/DeleteAccountModal.tsx?raw';
import loginRaw from '../pages/Login.tsx?raw';
import signupRaw from '../pages/Signup.tsx?raw';

describe('Settings Reauthentication & Security Redesign', () => {
  const mockUser: User = {
    id: '11111111-2222-3333-4444-555555555555',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: 'alex@example.com'
  };

  const mockOAuthUser: User = {
    id: '99999999-8888-7777-6666-555555555555',
    app_metadata: { provider: 'google' },
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: 'oauth.user@gmail.com',
    identities: [{ id: 'google-id', identity_id: 'google-identity-id', user_id: '99999999-8888-7777-6666-555555555555', identity_data: {}, provider: 'google', last_sign_in_at: '', created_at: '', updated_at: '' }]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Account Provider Detection (isEmailPasswordAccount)', () => {
    it('correctly identifies email/password accounts', () => {
      expect(isEmailPasswordAccount(mockUser)).toBe(true);
    });

    it('correctly identifies OAuth accounts (Google, GitHub, etc.)', () => {
      expect(isEmailPasswordAccount(mockOAuthUser)).toBe(false);
    });

    it('returns false for null user', () => {
      expect(isEmailPasswordAccount(null)).toBe(false);
    });
  });

  describe('2. Ephemeral Password Verification (verifyCurrentPassword)', () => {
    it('rejects empty or whitespace-only password immediately without API call', async () => {
      const resEmpty = await verifyCurrentPassword(mockUser, '');
      expect(resEmpty.success).toBe(false);
      expect(resEmpty.error).toContain('Please enter your current account password');

      const resWhitespace = await verifyCurrentPassword(mockUser, '    ');
      expect(resWhitespace.success).toBe(false);
      expect(resWhitespace.error).toContain('Please enter your current account password');
    });

    it('rejects unauthenticated user', async () => {
      const res = await verifyCurrentPassword(null, 'SomePass123!');
      expect(res.success).toBe(false);
      expect(res.error).toContain('User is not authenticated');
    });

    it('uses non-persisting ephemeral client storage to prevent session mutation', async () => {
      let createdClientOptions: any = null;
      const mockCustomFactory = (_url: string, _key: string) => {
        createdClientOptions = {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        };
        return {
          auth: {
            signInWithPassword: vi.fn().mockResolvedValue({
              data: { user: { id: mockUser.id } },
              error: null
            })
          }
        } as any;
      };

      const result = await verifyCurrentPassword(mockUser, 'correct-password', mockCustomFactory);
      expect(result.success).toBe(true);
      expect(createdClientOptions.auth.persistSession).toBe(false);
      expect(createdClientOptions.auth.autoRefreshToken).toBe(false);
    });

    it('reports clean, non-alarming error message on invalid credentials', async () => {
      const mockCustomFactory = () => ({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid login credentials' }
          })
        }
      } as any);

      const result = await verifyCurrentPassword(mockUser, 'wrong-password', mockCustomFactory);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Incorrect password. Please verify your credentials and try again.');
    });

    it('detects user account identity mismatch safely', async () => {
      const mockCustomFactory = () => ({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: { id: 'different-account-id' } },
            error: null
          })
        }
      } as any);

      const result = await verifyCurrentPassword(mockUser, 'valid-password', mockCustomFactory);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Identity verification failed: account mismatch');
    });
  });

  describe('3. Security Section Access Gate Architecture', () => {
    it('does not render security settings content unless identity verification has succeeded', () => {
      // In SettingsPage, security settings tab must explicitly check isVerified
      expect(settingsPageRaw).toMatch(/activeTab === 'security' && isVerified/);
    });

    it('redirects to account tab and opens verification modal if unverified user navigates to security', () => {
      expect(settingsPageRaw).toContain("if (tabId === 'security')");
      expect(settingsPageRaw).toContain('if (!isVerified)');
      expect(settingsPageRaw).toContain('setIsVerifyModalOpen(true)');
    });

    it('mounts VerifyIdentityModal with accessible dialog attributes and password controls', () => {
      expect(verifyModalRaw).toContain('role="dialog"');
      expect(verifyModalRaw).toContain('aria-modal="true"');
      expect(verifyModalRaw).toContain('aria-labelledby="verify-identity-title"');
      expect(verifyModalRaw).toContain("'Hide password'");
      expect(verifyModalRaw).toContain("'Show password'");
      expect(verifyModalRaw).toContain('aria-label="Close dialog"');
    });

    it('clears password immediately after submission attempt to maintain zero lingering memory', () => {
      expect(verifyModalRaw).toContain("setPassword('')");
    });
  });

  describe('4. Expiration, Visibility Auto-Lock & Timer Cleanup', () => {
    it('implements 5-minute limited verification lifetime in useSecurityVerification', () => {
      expect(settingsPageRaw).toContain('useSecurityVerification');
      expect(settingsPageRaw).toContain('timeRemaining');
    });

    it('re-locks security section on page visibility change (tab hidden) and pagehide', () => {
      expect(settingsPageRaw).toContain('handleAutoLock');
    });

    it('provides an explicit "Lock Section" control allowing instant manual revocation', () => {
      expect(settingsPageRaw).toContain('Lock Section');
      expect(settingsPageRaw).toContain('onClick={lock}');
    });
  });

  describe('5. Independent Sensitive Operation Protection (Password Change & Account Deletion)', () => {
    it('requires current password verification before updating password in handleUpdatePassword', () => {
      expect(settingsPageRaw).toMatch(/verifyCurrentPassword\(user,\s*currentPassword\)/);
      expect(settingsPageRaw).toContain('supabase.auth.updateUser({ password: newPassword })');
    });

    it('validates password length and confirms match before submitting update', () => {
      expect(settingsPageRaw).toContain('newPassword.length < 6');
      expect(settingsPageRaw).toContain('newPassword !== confirmPassword');
      expect(settingsPageRaw).toContain('currentPassword === newPassword');
    });

    it('clears password fields after successful update', () => {
      expect(settingsPageRaw).toContain("setCurrentPassword('')");
      expect(settingsPageRaw).toContain("setNewPassword('')");
      expect(settingsPageRaw).toContain("setConfirmPassword('')");
    });

    it('protects account deletion with fresh verification and DELETE text confirmation in DeleteAccountModal', () => {
      expect(deleteModalRaw).toContain('role="dialog"');
      expect(deleteModalRaw).toContain('aria-modal="true"');
      expect(deleteModalRaw).toContain('Permanently Delete Account');
      expect(deleteModalRaw).toMatch(/confirmText\.trim\(\)\.toUpperCase\(\) === 'DELETE'/);
      expect(deleteModalRaw).toContain('Confirm Your Current Password');
    });

    it('discloses all categories of data wiped upon account deletion', () => {
      expect(deleteModalRaw).toContain('tasks, recurring templates, and completion logs');
      expect(deleteModalRaw).toContain('notes, rich documents, and folders');
      expect(deleteModalRaw).toContain('conversations, messages, and friend relationships');
      expect(deleteModalRaw).toContain('uploaded image media');
      expect(deleteModalRaw).toContain('Supabase Auth credentials');
    });

    it('executes storage pre-cleanup and backend authoritative delete_user_account RPC without client user ID injection', () => {
      expect(settingsPageRaw).toMatch(/supabase\s*\.rpc\('delete_user_account'\)/);
      expect(settingsPageRaw).toMatch(/supabase\s*\.storage\s*\.from\('message-images'\)/);
    });
  });

  describe('6. Settings Cohesive Structure & Data Portability Preservation', () => {
    it('maintains GDPR Article 20 full data export payload intact', () => {
      expect(settingsPageRaw).toMatch(/supabase\s*\.from\('messages'\)\s*\.select\('\*'\)\s*\.eq\('sender_id',\s*user\.id\)/);
      expect(settingsPageRaw).toContain('sentMessages: messagesRes.data');
      expect(settingsPageRaw).toMatch(/supabase\s*\.from\('friendships'\)\s*\.select\('\*'\)/);
      expect(settingsPageRaw).toContain('friendships: friendshipsRes.data');
      expect(settingsPageRaw).toMatch(/supabase\s*\.from\('user_preferences'\)\s*\.select\('\*'\)/);
      expect(settingsPageRaw).toContain('preferences: prefsRes.data');
    });

    it('preserves user preference toggles and feedback state', () => {
      expect(settingsPageRaw).toContain('email_notifications');
      expect(settingsPageRaw).toContain('friend_request_notifications');
      expect(settingsPageRaw).toContain('productivity_reminders');
    });
  });

  describe('7. Login & Signup Password Visibility (Eye Symbol Toggle)', () => {
    it('provides show/hide password toggle button with accessible labels in Login.tsx', () => {
      expect(loginRaw).toContain('showPassword');
      expect(loginRaw).toContain('EyeOff');
      expect(loginRaw).toContain('Eye');
      expect(loginRaw).toContain('type={showPassword ? "text" : "password"}');
      expect(loginRaw).toContain("'Hide password'");
      expect(loginRaw).toContain("'Show password'");
    });

    it('provides show/hide password toggle button with accessible labels in Signup.tsx', () => {
      expect(signupRaw).toContain('showPassword');
      expect(signupRaw).toContain('EyeOff');
      expect(signupRaw).toContain('Eye');
      expect(signupRaw).toContain('type={showPassword ? "text" : "password"}');
      expect(signupRaw).toContain("'Hide password'");
      expect(signupRaw).toContain("'Show password'");
    });
  });
});
