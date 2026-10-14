import { useState, useEffect, useRef } from 'react';
import { Shield, Eye, EyeOff, Loader2, X, AlertCircle } from 'lucide-react';
import { SmoothInput } from '../ui/SmoothInput';

interface VerifyIdentityModalProps {
  isOpen: boolean;
  userEmail?: string;
  isEmailAuth: boolean;
  isVerifying: boolean;
  errorMessage: string | null;
  onVerify: (password: string) => Promise<boolean>;
  onConfirmOAuth: () => void;
  onCancel: () => void;
}

export function VerifyIdentityModal({
  isOpen,
  userEmail,
  isEmailAuth,
  isVerifying,
  errorMessage,
  onVerify,
  onConfirmOAuth,
  onCancel
}: VerifyIdentityModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Focus management & Escape key handling
  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setShowPassword(false);
      setLocalError(null);
      return;
    }

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.from(focusableElements).filter(
          (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
        );

        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!isEmailAuth) {
      onConfirmOAuth();
      return;
    }

    if (!password.trim()) {
      setLocalError('Please enter your account password.');
      return;
    }

    const enteredPassword = password;
    // Clear password input state immediately to avoid lingering sensitive data in memory
    setPassword('');

    const success = await onVerify(enteredPassword);
    if (!success) {
      passwordInputRef.current?.focus();
    }
  };

  const displayedError = localError || errorMessage;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md animate-fade-in"
      aria-labelledby="verify-identity-title"
      aria-describedby="verify-identity-desc"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md bg-surface border border-border/80 rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col gap-6 text-textMain animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
              <Shield size={20} />
            </div>
            <div>
              <h2 id="verify-identity-title" className="text-lg font-bold tracking-tight text-textMain">
                Verify your identity
              </h2>
              <p id="verify-identity-desc" className="text-xs text-textMuted mt-0.5">
                Authentication required to access security settings.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-textMuted hover:text-textMain hover:bg-surfaceHover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Account Info Pill */}
        {userEmail && (
          <div className="bg-background border border-border/50 rounded-xl p-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-textMuted">Account</span>
            <span className="text-xs font-mono font-medium text-textMain truncate max-w-[240px]">{userEmail}</span>
          </div>
        )}

        {/* Error Alert */}
        {displayedError && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium flex items-center gap-2.5">
            <AlertCircle size={15} className="shrink-0" />
            <span>{displayedError}</span>
          </div>
        )}

        {/* Form Body */}
        {isEmailAuth ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="current-account-password" className="text-[10px] font-bold uppercase tracking-widest text-textMuted">
                Current Password
              </label>
              <div className="relative">
                <SmoothInput
                  ref={passwordInputRef}
                  id="current-account-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (localError) setLocalError(null);
                  }}
                  disabled={isVerifying}
                  className="w-full bg-background border border-border/60 rounded-xl px-4 py-2.5 pr-11 text-sm text-textMain placeholder:text-textMuted/40 focus:outline-none focus:border-accent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain p-1 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isVerifying}
                className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-textMuted hover:text-textMain hover:bg-surfaceHover transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isVerifying || !password.trim()}
                className="px-5 py-2.5 bg-accent text-background rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-accentHover disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-lg shadow-accent/10"
              >
                {isVerifying ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Password'
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-xs text-textMuted leading-relaxed">
              Your Eustace account is authenticated via an external identity provider (OAuth). Confirmation grants access to your security settings for 5 minutes.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-textMuted hover:text-textMain hover:bg-surfaceHover transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmOAuth}
                className="px-5 py-2.5 bg-accent text-background rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-accentHover transition-colors"
              >
                Confirm & Proceed
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
