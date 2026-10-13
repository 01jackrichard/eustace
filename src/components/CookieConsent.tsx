import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X } from 'lucide-react';

export const COOKIE_CONSENT_KEY = 'eustace_cookie_consent';

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(() => {
    try {
      return !localStorage.getItem(COOKIE_CONSENT_KEY);
    } catch {
      return false;
    }
  });

  const handleAccept = () => {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    } catch {
      // Safely ignore storage access restrictions
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie and Local Storage Compliance"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 max-w-md z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
    >
      <div className="bg-[#0d0d0d] border border-border/80 text-textMain rounded-xl shadow-2xl backdrop-blur-md p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cookie className="w-4 h-4 text-accent shrink-0" />
            <span className="text-xs font-semibold tracking-wider uppercase text-textMain">
              Cookie & Storage Notice
            </span>
          </div>
          <button
            onClick={handleAccept}
            className="text-textMuted hover:text-textMain transition-colors p-1 -mr-1 -mt-1 rounded-md"
            aria-label="Close cookie notice"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-[#a0a0a0]">
          We use strictly necessary local storage and session cookies to keep you signed in and preserve your workspace preferences. We do not use third-party advertising or tracking cookies.
        </p>

        <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/40">
          <Link
            to="/privacy"
            className="text-xs text-textMuted hover:text-white underline underline-offset-4 transition-colors font-medium"
          >
            Privacy Policy
          </Link>
          <button
            onClick={handleAccept}
            className="px-3.5 py-1.5 bg-white text-black hover:bg-neutral-200 text-xs font-semibold rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
