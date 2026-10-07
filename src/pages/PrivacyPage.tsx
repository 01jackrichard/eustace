import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-[#ededed] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-[#888888] hover:text-[#ffffff] transition-colors mb-8 uppercase tracking-widest"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-[#181818] border border-[#2b2b2b] text-accent">
            <Shield className="w-5 h-5" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Privacy Policy</h1>
        </div>

        <p className="text-xs font-mono text-[#777777] mb-8">Effective Date: October 7, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-[#b0b0b0]">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white tracking-tight">1. Overview</h2>
            <p>
              Eustace is built on principles of data sovereignty and privacy-by-design. This Privacy Policy details how we collect, store, and process your personal information across our Progressive Web Application and database services in compliance with the General Data Protection Regulation (GDPR) and California Consumer Privacy Act (CCPA).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white tracking-tight">2. Information We Collect</h2>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li><strong className="text-white">Account Information:</strong> Email address, username, display name, and avatar image uploaded through your profile settings.</li>
              <li><strong className="text-white">Productivity & Task Data:</strong> Task titles, categories, durations, recurrence rules, completion timestamps, and daily reflections.</li>
              <li><strong className="text-white">Notes & Knowledge:</strong> Personal notes, tags, and folder organizational hierarchies.</li>
              <li><strong className="text-white">Social Connections:</strong> Friend relationships and requests initiated with other users.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white tracking-tight">3. How Your Data is Protected</h2>
            <p>
              All application data is protected by PostgreSQL Row Level Security (RLS) policies. Private tasks, notes, and productivity logs are cryptographically tied to your authenticated session ID and cannot be viewed by third parties or unauthorized users.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white tracking-tight">4. Data Portability & Erasure (GDPR Rights)</h2>
            <p>
              You maintain complete ownership of your data:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li><strong className="text-white">Right to Access and Export (Article 20):</strong> You can export your full database record as a standardized JSON file at any time via Account Settings.</li>
              <li><strong className="text-white">Right to Erasure (Article 17):</strong> When you delete your account in Settings, your user profile, tasks, completions, notes, folders, and uploaded storage assets are immediately and permanently erased via cascading database deletion.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white tracking-tight">5. Third-Party Services</h2>
            <p>
              We utilize Supabase for identity management and PostgreSQL database hosting. We do not sell, rent, or monetize your personal data or productivity logs with advertising third parties.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-[#1c1c1c] text-xs text-[#666666] flex justify-between items-center">
          <span>Eustace Productivity Systems</span>
          <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}
