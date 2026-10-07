import { Link } from 'react-router-dom';
import { ArrowLeft, Scale } from 'lucide-react';

export function TermsPage() {
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
            <Scale className="w-5 h-5" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Terms of Service</h1>
        </div>

        <p className="text-xs font-mono text-[#777777] mb-8">Effective Date: October 7, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-[#b0b0b0]">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white tracking-tight">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Eustace application, you agree to be bound by these Terms of Service. If you do not agree to these terms, you must discontinue use of the service immediately.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white tracking-tight">2. User Accounts & Responsibilities</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your session. You agree not to upload malicious code, attempt unauthorized access to other user accounts, or abuse API endpoints.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white tracking-tight">3. User Content & Ownership</h2>
            <p>
              You retain all intellectual property rights to the content, notes, and task data you create within Eustace. We do not claim ownership over any user data submitted to the platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white tracking-tight">4. Termination & Deletion</h2>
            <p>
              You may terminate your account at any time through the Settings page. Account deletion immediately initiates an automated cascade that purges your profile, files, and relational data from our storage systems.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white tracking-tight">5. Disclaimer of Warranties</h2>
            <p>
              The service is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind. While we design for high availability and data integrity, we are not liable for any indirect or consequential damages arising from service interruption.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-[#1c1c1c] text-xs text-[#666666] flex justify-between items-center">
          <span>Eustace Productivity Systems</span>
          <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}
