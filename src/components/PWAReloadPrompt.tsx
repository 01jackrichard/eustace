import { useRegisterSW } from 'virtual:pwa-register/react';
import { X } from 'lucide-react';

export function PWAReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setNeedRefresh(false);
  };

  // We only show a toast-like bottom sheet if there is an update (needRefresh)
  // or if it's ready to work offline, though we can skip the offline ready one to be less annoying.
  
  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 left-4 md:left-auto z-[999] animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="bg-surface border border-border/60 shadow-2xl rounded-xl p-4 md:p-5 max-w-sm w-full mx-auto flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-widest text-textMain uppercase mb-1">Update Available</h3>
            <p className="text-xs font-medium text-textMuted">
              A new version of Eustace is ready.
            </p>
          </div>
          <button onClick={close} className="text-textMuted hover:text-textMain p-1 transition-colors">
            <X size={16} />
          </button>
        </div>
        <button
          onClick={() => updateServiceWorker(true)}
          className="w-full py-2.5 bg-textMain text-background text-[10px] font-bold tracking-[0.2em] uppercase rounded-lg hover:bg-white transition-colors"
        >
          Update Now
        </button>
      </div>
    </div>
  );
}
