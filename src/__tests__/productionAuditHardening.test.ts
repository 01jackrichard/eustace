import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadMessageImage } from '../lib/chatStorage';
import { supabase } from '../lib/supabase';
import migrationSql from '../../supabase/migrations/20261014193000_production_hardening_and_schema_reconciliation.sql?raw';
import currentRefSql from '../../supabase/CURRENT_DATABASE_REFERENCE.sql?raw';

describe('Production Audit Hardening Remediation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Chat Storage File MIME & Extension Hardening', () => {
    it('rejects unsupported image MIME types immediately before storage upload', async () => {
      const maliciousFile = new File(['fake-php-payload'], 'exploit.php', { type: 'application/x-php' });
      await expect(uploadMessageImage('conv-123', maliciousFile)).rejects.toThrow(
        /Unsupported image format/
      );
    });

    it('rejects executable scripts spoofed as text/html', async () => {
      const htmlFile = new File(['<script>alert(1)</script>'], 'xss.html', { type: 'text/html' });
      await expect(uploadMessageImage('conv-123', htmlFile)).rejects.toThrow(
        /Unsupported image format/
      );
    });

    it('sanitizes file extensions to deterministic webp/png/jpg regardless of original filename', async () => {
      const uploadMock = vi.fn().mockResolvedValue({
        data: { path: 'conv-123/sanitized.png' },
        error: null
      });

      vi.spyOn(supabase.storage, 'from').mockReturnValue({
        upload: uploadMock
      } as any);

      const fakeImage = new File(['dummy-bytes'], 'arbitrary-name.exe', { type: 'image/png' });
      const result = await uploadMessageImage('conv-123', fakeImage);

      expect(uploadMock).toHaveBeenCalled();
      const uploadedPath = uploadMock.mock.calls[0][0];
      expect(uploadedPath).toMatch(/^conv-123\/\d+_[a-z0-9]+\.png$/);
      expect(result.imagePath).toBe('conv-123/sanitized.png');
    });
  });

  describe('2. Timezone-Aware Streak Calculation Architecture', () => {
    it('defines timezone-aware calculation in production hardening migration', () => {
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.calculate_user_streak(target_user_id uuid)');
      expect(migrationSql).toContain('SELECT COALESCE(NULLIF(p.timezone');
      expect(migrationSql).toContain('v_today := (timezone(v_user_tz, now()))::date;');
      expect(migrationSql).toContain('WHERE streak_end >= v_today - 1');
    });

    it('synchronizes timezone-aware calculation into consolidated CURRENT_DATABASE_REFERENCE.sql', () => {
      expect(currentRefSql).toContain('CREATE OR REPLACE FUNCTION public.calculate_user_streak(target_user_id uuid)');
      expect(currentRefSql).toContain('SELECT COALESCE(NULLIF(p.timezone');
      expect(currentRefSql).toContain('v_today := (timezone(v_user_tz, now()))::date;');
      expect(currentRefSql).toContain('WHERE streak_end >= v_today - 1');
    });
  });

  describe('3. Server-Side Password Verified Account Deletion', () => {
    it('defines server-side password verification in delete_user_account RPC', () => {
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.delete_user_account(p_password text DEFAULT NULL)');
      expect(migrationSql).toContain('Password verification required to delete account');
      expect(migrationSql).toContain('crypt(trim(p_password), v_encrypted_pwd)');
      expect(migrationSql).toContain('Incorrect password. Account deletion unauthorized.');
    });

    it('synchronizes hardened delete_user_account into consolidated CURRENT_DATABASE_REFERENCE.sql', () => {
      expect(currentRefSql).toContain('CREATE OR REPLACE FUNCTION public.delete_user_account(p_password text DEFAULT NULL)');
      expect(currentRefSql).toContain('crypt(trim(p_password), v_encrypted_pwd)');
      expect(currentRefSql).toContain('Incorrect password. Account deletion unauthorized.');
    });
  });

  describe('4. Direct Messaging Schema Consolidation in Reference SQL', () => {
    it('contains all direct messaging tables in CURRENT_DATABASE_REFERENCE.sql', () => {
      expect(currentRefSql).toContain('CREATE TABLE public.conversations');
      expect(currentRefSql).toContain('CREATE TABLE public.conversation_members');
      expect(currentRefSql).toContain('CREATE TABLE public.messages');
    });

    it('contains all direct messaging RPCs and RLS policies in CURRENT_DATABASE_REFERENCE.sql', () => {
      expect(currentRefSql).toContain('CREATE OR REPLACE FUNCTION public.get_or_create_conversation');
      expect(currentRefSql).toContain('CREATE OR REPLACE FUNCTION public.mark_conversation_read');
      expect(currentRefSql).toContain('CREATE OR REPLACE FUNCTION public.acknowledge_message_delivery');
      expect(currentRefSql).toContain('ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;');
      expect(currentRefSql).toContain('ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;');
      expect(currentRefSql).toContain('ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;');
      expect(currentRefSql).toContain('bucket_id = \'message-images\'');
    });

    it('contains tasks start_time column in CURRENT_DATABASE_REFERENCE.sql', () => {
      expect(currentRefSql).toContain('start_time time without time zone DEFAULT NULL');
      expect(currentRefSql).toContain('monthly');
      expect(currentRefSql).toContain('yearly');
    });
  });
});
