import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (!isCmdOrCtrl) return;

      // Handle specific key codes
      switch (e.key.toLowerCase()) {
        case 'p':
          e.preventDefault();
          toast('Command Palette coming soon!', { icon: '⌨️' });
          break;
        case 'o':
          e.preventDefault();
          toast('Quick Switcher coming soon!', { icon: '⌨️' });
          break;
        case 'g':
          e.preventDefault();
          toast('Graph View coming soon!', { icon: '⌨️' });
          break;
        case 'n':
          e.preventDefault();
          navigate('/notes');
          break;
        case ',':
          e.preventDefault();
          navigate('/settings');
          break;
      }

      // Handle Back/Forward
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
