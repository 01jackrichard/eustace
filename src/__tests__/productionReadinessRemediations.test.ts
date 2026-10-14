import { describe, it, expect } from 'vitest';

// Load source file raw contents for static analysis and architecture verification
import barChartRaw from '../components/charts/bar-chart.tsx?raw';
import editProfileModalRaw from '../components/EditProfileModal.tsx?raw';
import notesModalsRaw from '../components/NotesModals.tsx?raw';
import settingsPageRaw from '../pages/SettingsPage.tsx?raw';
import appRaw from '../App.tsx?raw';
import notFoundPageRaw from '../pages/NotFoundPage.tsx?raw';
import addTaskModalRaw from '../components/AddTaskModal.tsx?raw';
import contributionGraphRaw from '../components/ContributionGraph.tsx?raw';
import errorBoundaryRaw from '../components/ErrorBoundary.tsx?raw';
import robotsTxtRaw from '../../public/robots.txt?raw';
import sitemapXmlRaw from '../../public/sitemap.xml?raw';

describe('Production Readiness Remediations (REM-01 to REM-07)', () => {
  describe('REM-01: React 19 Compiler Render Purity (bar-chart.tsx)', () => {
    it('does not invoke Date.now() inside useMemo or render cycle', () => {
      // Must not call Date.now() in bar-chart
      expect(barChartRaw).not.toContain('Date.now()');
    });

    it('defines a deterministic, stable timestamp domain for fakeTimeScale', () => {
      expect(barChartRaw).toContain('new Date(0)');
      expect(barChartRaw).toContain('fakeTimeScale');
    });
  });

  describe('REM-02: State Synchronization & Hook Dependencies (EditProfileModal & NotesModals)', () => {
    it('in EditProfileModal, does not call setUsernameStatus synchronously inside useEffect for prop sync', () => {
      // Should not do synchronous setUsernameStatus('idle') in effect on username change
      expect(editProfileModalRaw).not.toMatch(/useEffect\s*\(\s*\(\)\s*=>\s*\{\s*setUsernameStatus\('idle'\)/);
    });

    it('in EditProfileModal, wraps validateUsername in useCallback and includes it in useEffect deps', () => {
      expect(editProfileModalRaw).toContain('useCallback');
      expect(editProfileModalRaw).toMatch(/\[debouncedUsername,\s*normalizedCurrentUsername,\s*profile\?\.username,\s*validateUsername\]/);
    });

    it('in NotesModals, does not invoke setName or setTags synchronously on isOpen change in useEffect', () => {
      expect(notesModalsRaw).not.toMatch(/useEffect\s*\(\s*\(\)\s*=>\s*\{\s*setName\(initialName\)/);
    });
  });

  describe('REM-03: GDPR Article 20 Export Completeness & Storage Pruning (SettingsPage.tsx)', () => {
    it('queries user sent messages in handleExportData', () => {
      expect(settingsPageRaw).toMatch(/supabase\s*\.from\('messages'\)\s*\.select\('\*'\)\s*\.eq\('sender_id',\s*user\.id\)/);
      expect(settingsPageRaw).toContain('sentMessages: messagesRes.data');
    });

    it('queries friendships in handleExportData', () => {
      expect(settingsPageRaw).toMatch(/supabase\s*\.from\('friendships'\)\s*\.select\('\*'\)/);
      expect(settingsPageRaw).toContain('friendships: friendshipsRes.data');
    });

    it('queries user_preferences in handleExportData', () => {
      expect(settingsPageRaw).toMatch(/supabase\s*\.from\('user_preferences'\)\s*\.select\('\*'\)/);
      expect(settingsPageRaw).toContain('preferences: prefsRes.data');
    });

    it('prunes message-images bucket storage in handleDeleteAccount', () => {
      expect(settingsPageRaw).toMatch(/supabase\s*\.storage\s*\.from\('message-images'\)/);
    });
  });

  describe('REM-04: Public SEO Directives (robots.txt & sitemap.xml)', () => {
    it('contains expected crawler directives and sitemap pointer in robots.txt', () => {
      expect(robotsTxtRaw).toContain('User-agent: *');
      expect(robotsTxtRaw).toContain('Disallow: /settings');
      expect(robotsTxtRaw).toContain('Disallow: /chat/');
      expect(robotsTxtRaw).toContain('Sitemap: https://eustace-pi.vercel.app/sitemap.xml');
    });

    it('contains canonical public platform routes in sitemap.xml', () => {
      expect(sitemapXmlRaw).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(sitemapXmlRaw).toContain('<loc>https://eustace-pi.vercel.app/</loc>');
      expect(sitemapXmlRaw).toContain('<loc>https://eustace-pi.vercel.app/login</loc>');
      expect(sitemapXmlRaw).toContain('<loc>https://eustace-pi.vercel.app/signup</loc>');
      expect(sitemapXmlRaw).toContain('<loc>https://eustace-pi.vercel.app/terms</loc>');
      expect(sitemapXmlRaw).toContain('<loc>https://eustace-pi.vercel.app/privacy</loc>');
    });
  });

  describe('REM-05: Dedicated 404 Route & Dynamic Document Titles', () => {
    it('defines a dedicated NotFoundPage component with home navigation', () => {
      expect(notFoundPageRaw).toContain('404');
      expect(notFoundPageRaw).toContain('Page Not Found');
      expect(notFoundPageRaw).toContain('Return to Dashboard');
    });

    it('mounts NotFoundPage on wildcard route * in App.tsx instead of silently redirecting', () => {
      expect(appRaw).toMatch(/<Route\s+path="\*"\s+element=\{<NotFoundPage\s*\/>\}\s*\/>/);
      expect(appRaw).not.toMatch(/<Route\s+path="\*"\s+element=\{<Navigate\s+to="\/"\s+replace\s*\/>\}\s*\/>/);
    });

    it('updates dynamic browser tab titles per active route in App.tsx', () => {
      expect(appRaw).toContain('useDynamicDocumentTitle');
      expect(appRaw).toContain('Dashboard — Eustace');
      expect(appRaw).toContain('Daily Tasks — Eustace');
      expect(appRaw).toContain('Calendar — Eustace');
      expect(appRaw).toContain('Notes — Eustace');
      expect(appRaw).toContain('Friends — Eustace');
      expect(appRaw).toContain('Settings — Eustace');
    });
  });

  describe('REM-06: Accessibility (WCAG 2.2 AA) Dialog Semantics & Focus Trapping', () => {
    it('ensures AddTaskModal provides dialog accessibility roles and Tab focus trapping', () => {
      expect(addTaskModalRaw).toContain('role="dialog"');
      expect(addTaskModalRaw).toContain('aria-modal="true"');
      expect(addTaskModalRaw).toContain('aria-labelledby="add-task-modal-title"');
      expect(addTaskModalRaw).toContain('aria-label="Close dialog"');
      expect(addTaskModalRaw).toContain('aria-label="Choose task icon"');
      // Focus trapping handler
      expect(addTaskModalRaw).toMatch(/handleKeyDown.*e\.key === 'Tab'/s);
    });

    it('ensures NotesModals provides dialog accessibility roles and Tab focus trapping', () => {
      expect(notesModalsRaw).toContain('role="dialog"');
      expect(notesModalsRaw).toContain('aria-modal="true"');
      expect(notesModalsRaw).toContain('aria-labelledby=');
      expect(notesModalsRaw).toContain('aria-label="Close dialog"');
      // Focus trapping handler
      expect(notesModalsRaw).toMatch(/handleKeyDown.*e\.key === 'Tab'/s);
    });
  });

  describe('REM-07: Design Token Consolidation', () => {
    it('standardizes arbitrary hex backgrounds to design tokens in AddTaskModal', () => {
      expect(addTaskModalRaw).not.toContain('bg-[#0d0d0d]');
      expect(addTaskModalRaw).not.toContain('bg-[#090909]');
      expect(addTaskModalRaw).not.toContain('bg-[#0a0a0a]');
    });

    it('standardizes arbitrary hex colors to design tokens in ContributionGraph', () => {
      expect(contributionGraphRaw).not.toContain('bg-[#0a0a0a]');
      expect(contributionGraphRaw).not.toContain('ring-offset-[#101010]');
      expect(contributionGraphRaw).not.toContain('bg-[#141414]');
    });

    it('standardizes arbitrary hex colors to design tokens in ErrorBoundary', () => {
      expect(errorBoundaryRaw).not.toContain('bg-[#050505]');
      expect(errorBoundaryRaw).not.toContain('text-[#f5f5f5]');
      expect(errorBoundaryRaw).not.toContain('bg-[#111111]');
      expect(errorBoundaryRaw).not.toContain('border-[#222222]');
      expect(errorBoundaryRaw).not.toContain('text-[#888888]');
      expect(errorBoundaryRaw).not.toContain('bg-[#181818]');
      expect(errorBoundaryRaw).not.toContain('border-[#262626]');
      expect(errorBoundaryRaw).not.toContain('bg-[#ffffff]');
      expect(errorBoundaryRaw).not.toContain('text-[#000000]');
      expect(errorBoundaryRaw).not.toContain('bg-[#1c1c1c]');
      expect(errorBoundaryRaw).not.toContain('border-[#333333]');
    });
  });
});
