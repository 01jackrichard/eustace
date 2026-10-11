import { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageViewerModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

export function ImageViewerModal({ imageUrl, onClose }: ImageViewerModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (imageUrl) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imageUrl, onClose]);

  if (!imageUrl) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8"
        onClick={onClose}
      >
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
          <a
            href={imageUrl}
            download="eustace_image.webp"
            target="_blank"
            rel="noreferrer"
            className="p-2.5 rounded-full bg-surface/80 hover:bg-surface text-textMain border border-border/40 transition-colors"
            title="Download full size"
          >
            <Download size={18} />
          </a>
          <button
            onClick={onClose}
            className="p-2.5 rounded-full bg-surface/80 hover:bg-surface text-textMain border border-border/40 transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.95 }}
          className="max-w-4xl max-h-[85vh] flex items-center justify-center overflow-hidden rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={imageUrl}
            alt="Enlarged view"
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-border/20"
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
