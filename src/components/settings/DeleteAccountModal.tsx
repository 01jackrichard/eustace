import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Loader2, X, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { SmoothInput } from '../ui/SmoothInput';

interface DeleteAccountModalProps {
  isOpen: boolean;
  userEmail?: string;
  isEmailAuth: boolean;
  isDeleting: boolean;
  onDelete: (password?: string) => Promise<boolean>;
  onCancel: () => void;
}

export function DeleteAccountModal({
  isOpen,
  userEmail,
  isEmailAuth,
  isDeleting,
  onDelete,
  onCancel
}: DeleteAccountModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setConfirmText('');
      setPassword('');
      setShowPassword(false);
      setErrorMessage(null);
      return;
    }

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => {
      confirmInputRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
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
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  const isConfirmed = confirmText.trim().toUpperCase() === 'DELETE';
  const canSubmit = isConfirmed && (!isEmailAuth || password.trim().length > 0) && !isDeleting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setErrorMessage(null);
    const pwd = password;
    // Clear password from local state
    setPassword('');

    const success = await onDelete(isEmailAuth ? pwd : undefined);
    if (!success) {
      // If failed, user stays in modal with error shown
      setErrorMessage('Account deletion could not be completed. Please check your credentials.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md animate-fade-in"
      aria-labelledby="delete-account-title"
      aria-describedby="delete-account-desc"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-surface border border-red-500/30 rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col gap-6 text-textMain animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 id="delete-account-title" className="text-lg font-bold tracking-tight text-red-400">
                Permanently Delete Account
              </h2>
              <p id="delete-account-desc" className="text-xs text-textMuted mt-0.5">
                This action is irreversible and immediately wipes all data.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-textMuted hover:text-textMain hover:bg-surfaceHover transition-colors disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Categories of Affected Data Warning */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-xs text-textMuted space-y-2">
          <p className="font-bold text-red-400/90 uppercase tracking-wider text-[10px]">
            The following data will be permanently removed:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-textMuted/90 leading-relaxed">
            <li>Your public handle, display name, avatar, and profile history</li>
            <li>All personal tasks, recurring templates, and completion logs</li>
            <li>All personal and shared notes, rich documents, and folders</li>
            <li>All direct conversations, messages, and friend relationships</li>
            <li>All uploaded image media (avatars, covers, chat attachments)</li>
            <li>Your Supabase Auth credentials and session access tokens</li>
          </ul>
        </div>

        {errorMessage && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium flex items-center gap-2.5">
            <ShieldAlert size={15} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Fresh Password Verification for Email/Password Accounts */}
          {isEmailAuth && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="delete-account-password" className="text-[10px] font-bold uppercase tracking-widest text-textMuted">
                Confirm Your Current Password
              </label>
              <div className="relative">
                <SmoothInput
                  id="delete-account-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter current password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isDeleting}
                  className="w-full bg-background border border-border/60 rounded-xl px-4 py-2.5 pr-11 text-sm text-textMain placeholder:text-textMuted/40 focus:outline-none focus:border-red-500 transition-colors"
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
          )}

          {/* Deliberate Confirmation Text */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="delete-account-confirmation" className="text-[10px] font-bold uppercase tracking-widest text-textMuted">
              Type <strong className="text-red-400 font-mono">DELETE</strong> to confirm
            </label>
            <SmoothInput
              ref={confirmInputRef}
              id="delete-account-confirmation"
              type="text"
              placeholder="DELETE"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isDeleting}
              autoComplete="off"
              className="w-full bg-background border border-border/60 rounded-xl px-4 py-2.5 text-sm text-textMain placeholder:text-textMuted/40 focus:outline-none focus:border-red-500 font-mono tracking-wider transition-colors"
            />
          </div>

          {userEmail && (
            <p className="text-[11px] text-textMuted">
              Account targeted: <span className="font-mono text-textMain">{userEmail}</span>
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
              className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-textMuted hover:text-textMain hover:bg-surfaceHover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-lg shadow-red-600/20"
            >
              {isDeleting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Deleting Account...
                </>
              ) : (
                'Permanently Delete Account'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
