import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show if the user hasn't dismissed it previously
    const hasDismissed = localStorage.getItem('eustace_pwa_dismissed') === 'true';
    if (hasDismissed) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile (optional, but good for custom UI)
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsVisible(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('eustace_pwa_dismissed', 'true');
  };

  if (!isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-accent text-background px-4 py-3 flex items-center justify-between animate-in slide-in-from-top-full duration-300 shadow-xl pb-[env(safe-area-inset-bottom)] md:pb-3 pt-[env(safe-area-inset-top)] md:pt-3">
      <div className="flex items-center gap-3">
        <div className="bg-background/20 p-1.5 rounded-lg">
          <Download size={16} className="text-background" />
        </div>
        <div>
          <p className="text-xs font-bold tracking-widest uppercase">Install Eustace</p>
          <p className="text-[10px] font-medium opacity-80">Add to your home screen for a better experience</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button 
          onClick={handleInstall}
          className="text-xs font-bold uppercase tracking-wider bg-background text-accent px-4 py-1.5 rounded-full hover:bg-white transition-colors"
        >
          Install
        </button>
        <button onClick={handleDismiss} className="text-background/70 hover:text-background p-1">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
