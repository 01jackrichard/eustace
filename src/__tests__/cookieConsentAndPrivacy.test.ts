import { describe, it, expect } from 'vitest';
import { COOKIE_CONSENT_KEY } from '../components/CookieConsent';
import privacyPolicyContent from '../pages/PrivacyPage.tsx?raw';
import vercelRaw from '../../vercel.json?raw';
import baselineSchemaSql from '../../supabase/migrations/20261001000000_baseline_schema.sql?raw';
import messagingSql from '../../supabase/migrations/20261011000000_direct_messaging_system.sql?raw';
import reconcileSql from '../../supabase/migrations/20261013110000_reconcile_missing_production_objects.sql?raw';
import bioPrivacySql from '../../supabase/migrations/20261013120000_fix_friend_profiles_bio_privacy.sql?raw';
import streakPrivacySql from '../../supabase/migrations/20261013123000_harden_calculate_user_streak_privacy.sql?raw';
import profileRlsSql from '../../supabase/migrations/20261013130000_enforce_profile_visibility_rls_and_rpc.sql?raw';
import currentRefSql from '../../supabase/CURRENT_DATABASE_REFERENCE.sql?raw';

describe('Cookie & Storage Compliance and Security Verification', () => {
  describe('CookieConsent Configuration & Key', () => {
    it('uses the expected localStorage key for cookie consent dismissal', () => {
      expect(COOKIE_CONSENT_KEY).toBe('eustace_cookie_consent');
    });

    it('simulates consent acknowledgment workflow correctly', () => {
      const mockStorage: Record<string, string> = {};
      const getItem = (key: string) => mockStorage[key] || null;
      const setItem = (key: string, val: string) => { mockStorage[key] = val; };

      // Initial state: not accepted
      expect(getItem(COOKIE_CONSENT_KEY)).toBeNull();

      // User accepts
      setItem(COOKIE_CONSENT_KEY, 'true');
      expect(getItem(COOKIE_CONSENT_KEY)).toBe('true');
    });
  });

  describe('Privacy Policy Compliance (Section 6)', () => {
    it('contains Section 6 dedicated to Cookies & Local Storage', () => {
      expect(privacyPolicyContent).toContain('6. Cookies & Local Storage');
    });

    it('explicitly lists sb-*-auth-token session credential storage', () => {
      expect(privacyPolicyContent).toContain('sb-*-auth-token');
      expect(privacyPolicyContent).toContain('Supabase JWT');
    });

    it('explicitly lists eustace_cookie_consent storage key', () => {
      expect(privacyPolicyContent).toContain('eustace_cookie_consent');
    });

    it('explicitly lists eustace_public_intro storage key', () => {
      expect(privacyPolicyContent).toContain('eustace_public_intro');
    });

    it('explicitly disclaims third-party advertising, tracking cookies, and telemetry', () => {
      expect(privacyPolicyContent).toMatch(/does not use third-party tracking.*advertising cookies.*telemetry/i);
    });
  });

  describe('Client Edge & Vercel Security Headers', () => {
    const vercelConfig = JSON.parse(vercelRaw);

    it('configures strict Content-Security-Policy', () => {
      const headers = vercelConfig.headers[0].headers;
      const csp = headers.find((h: any) => h.key === 'Content-Security-Policy');
      expect(csp).toBeDefined();
      expect(csp.value).toContain("default-src 'self'");
      expect(csp.value).toContain("frame-ancestors 'none'");
      expect(csp.value).toContain("object-src 'none'");
    });

    it('configures X-Frame-Options: DENY', () => {
      const headers = vercelConfig.headers[0].headers;
      const frameOpts = headers.find((h: any) => h.key === 'X-Frame-Options');
      expect(frameOpts).toBeDefined();
      expect(frameOpts.value).toBe('DENY');
    });

    it('configures Strict-Transport-Security (HSTS)', () => {
      const headers = vercelConfig.headers[0].headers;
      const hsts = headers.find((h: any) => h.key === 'Strict-Transport-Security');
      expect(hsts).toBeDefined();
      expect(hsts.value).toContain('max-age=31536000');
      expect(hsts.value).toContain('includeSubDomains');
    });

    it('configures X-Content-Type-Options: nosniff for MIME protection', () => {
      const headers = vercelConfig.headers[0].headers;
      const nosniff = headers.find((h: any) => h.key === 'X-Content-Type-Options');
      expect(nosniff).toBeDefined();
      expect(nosniff.value).toBe('nosniff');
    });
  });

  describe('PostgreSQL Row-Level Security & SECURITY DEFINER Hardening', () => {
    const consolidatedSql = [
      baselineSchemaSql,
      messagingSql,
      reconcileSql,
      bioPrivacySql,
      streakPrivacySql,
      profileRlsSql,
      currentRefSql
    ].join('\n');

    it('verifies core tables have Row Level Security enabled in migrations', () => {
      const coreTables = [
        'profiles',
        'tasks',
        'task_completions',
        'daily_data',
        'friendships',
        'user_preferences',
        'folders',
        'notes',
        'conversations',
        'conversation_members',
        'messages'
      ];

      coreTables.forEach(table => {
        const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
        expect(consolidatedSql).toMatch(rlsRegex);
      });
    });

    it('ensures hardened SECURITY DEFINER functions set an empty search_path', () => {
      const hardenedSqlSources = [
        reconcileSql,
        bioPrivacySql,
        streakPrivacySql,
        profileRlsSql
      ];

      hardenedSqlSources.forEach(sql => {
        const secDefinerCount = (sql.match(/SECURITY\s+DEFINER/gi) || []).length;
        const searchPathCount = (sql.match(/SET\s+search_path\s*=\s*''/gi) || []).length;
        expect(searchPathCount).toBeGreaterThanOrEqual(secDefinerCount);
      });
    });
  });
});
