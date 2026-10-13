import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}

export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept keystrokes while the user is actively typing in inputs or text areas
      if (isEditableTarget(e.target)) return;

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl) {
        // Supported global navigation shortcuts (avoid intercepting native browser hotkeys like P, O, G)
        switch (e.key.toLowerCase()) {
          case ',':
            e.preventDefault();
            navigate('/settings');
            break;
        }
      }

      // Alt + Left / Right for historical navigation
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate(-1);
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        navigate(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);
}
