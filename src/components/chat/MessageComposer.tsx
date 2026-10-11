import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Paperclip, Send, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../../lib/utils';
import { compressImageToLimit, type CompressedImageResult } from '../../lib/imageCompression';

interface MessageComposerProps {
  onSendMessage: (text: string) => Promise<void>;
  onSendImage: (
    file: File,
    previewUrl: string,
    metadata: { width: number; height: number; sizeBytes: number }
  ) => Promise<void>;
  disabled?: boolean;
  isFriendshipActive?: boolean;
}

export function MessageComposer({
  onSendMessage,
  onSendImage,
  disabled = false,
  isFriendshipActive = true
}: MessageComposerProps) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [compressionStage, setCompressionStage] = useState('');
  const [stagedImage, setStagedImage] = useState<CompressedImageResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Clean up object URL when stagedImage is removed or unmounted
  useEffect(() => {
    return () => {
      if (stagedImage) {
        URL.revokeObjectURL(stagedImage.previewUrl);
      }
    };
  }, [stagedImage]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so re-selecting same file fires onChange
    e.target.value = '';

    setCompressing(true);
    setCompressionStage('Validating image...');

    try {
      const result = await compressImageToLimit(file, (stage) => setCompressionStage(stage));
      setStagedImage(result);
    } catch (err: any) {
      console.error('Image compression error:', err);
      toast.error(err.message || 'Failed to process image. Maximum allowed size is 500 KB.');
    } finally {
      setCompressing(false);
      setCompressionStage('');
    }
  };

  const handleRemoveImage = () => {
    if (stagedImage) {
      URL.revokeObjectURL(stagedImage.previewUrl);
      setStagedImage(null);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting || compressing || disabled || !isFriendshipActive) return;

    const trimmedText = text.trim();

    // If we have an image staged
    if (stagedImage) {
      setIsSubmitting(true);
      const img = stagedImage;
      setStagedImage(null); // clear staging immediately
      try {
        await onSendImage(img.file, img.previewUrl, {
          width: img.width,
          height: img.height,
          sizeBytes: img.sizeBytes
        });
      } catch (err: any) {
        toast.error(err.message || 'Failed to upload image.');
        setStagedImage(img); // restore on error so user can retry
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Otherwise text message
    if (!trimmedText) return;

    if (trimmedText.length > 4000) {
      toast.error('Message exceeds maximum limit of 4,000 characters.');
      return;
    }

    setIsSubmitting(true);
    const textToSend = trimmedText;
    setText(''); // clear input optimistically
    try {
      await onSendMessage(textToSend);
    } catch (err: any) {
      setText(textToSend); // restore on error
      toast.error(err.message || 'Failed to send message.');
    } finally {
      setIsSubmitting(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isFriendshipActive) {
    return (
      <div className="w-full shrink-0 p-4 bg-surface/20 border-t border-border/20 text-center">
        <span className="text-xs font-medium text-textMuted/70">
          You and this user are no longer connected friends. New messages cannot be sent.
        </span>
      </div>
    );
  }

  const isSendDisabled =
    disabled ||
    isSubmitting ||
    compressing ||
    (!text.trim() && !stagedImage);

  return (
    <div className="w-full shrink-0 flex flex-col border-t border-border/25 bg-background/95 backdrop-blur-md p-3 md:p-4 gap-2.5">
      {/* COMPRESSION PROGRESS STATE */}
      {compressing && (
        <div className="flex items-center gap-2.5 px-3.5 py-2 bg-surface/50 border border-border/30 rounded-xl text-xs text-textMain animate-pulse">
          <Loader2 size={14} className="animate-spin text-accent" />
          <span>{compressionStage || 'Compressing image under 500 KB...'}</span>
        </div>
      )}

      {/* STAGED IMAGE PREVIEW */}
      {stagedImage && !compressing && (
        <div className="flex items-center gap-3 p-2 bg-surface/60 border border-border/40 rounded-xl w-fit max-w-sm">
          <img
            src={stagedImage.previewUrl}
            alt="Preview"
            className="w-12 h-12 rounded-lg object-cover border border-border/20"
          />
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-xs font-bold text-textMain truncate">{stagedImage.file.name}</span>
            <span className="text-[10px] font-mono text-accent">
              {Math.round(stagedImage.sizeBytes / 1000)} KB / 500 KB
            </span>
          </div>
          <button
            onClick={handleRemoveImage}
            disabled={isSubmitting}
            className="p-1 rounded-full text-textMuted hover:text-textMain hover:bg-surface/80 transition-colors ml-auto"
            title="Remove attachment"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* COMPOSER INPUT BAR */}
      <div className="w-full flex items-end gap-2 bg-surface/40 border border-border/40 focus-within:border-border/80 focus-within:bg-surface/60 rounded-2xl p-2 transition-all">
        {/* ATTACHMENT BUTTON */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={disabled || isSubmitting || compressing}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isSubmitting || compressing}
          title="Attach image (Max: 500 KB)"
          aria-label="Attach image (Max: 500 KB)"
          className="p-2 rounded-xl text-textMuted hover:text-textMain hover:bg-surface/80 transition-colors shrink-0 disabled:opacity-40"
        >
          <Paperclip size={18} />
        </button>

        {/* MULTILINE TEXTAREA */}
        <div className="flex-1 min-w-0 py-1">
          <TextareaAutosize
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={stagedImage ? 'Add a message or hit send...' : 'Type a message... (Shift+Enter for new line)'}
            maxRows={6}
            minRows={1}
            disabled={disabled || isSubmitting}
            className="w-full bg-transparent text-sm text-textMain placeholder:text-textMuted/50 focus:outline-none resize-none leading-relaxed"
          />
        </div>

        {/* CHARACTER COUNTER */}
        {text.length > 3000 && (
          <span
            className={cn(
              'text-[10px] font-mono select-none px-1 py-2 self-center',
              text.length > 4000 ? 'text-red-400 font-bold' : 'text-textMuted'
            )}
          >
            {text.length}/4000
          </span>
        )}

        {/* SEND BUTTON */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSendDisabled}
          title="Send message (Enter)"
          aria-label="Send message"
          className={cn(
            'p-2 rounded-xl shrink-0 transition-all duration-200 flex items-center justify-center',
            isSendDisabled
              ? 'text-textMuted/40 cursor-not-allowed bg-transparent'
              : 'bg-textMain text-background hover:bg-white active:scale-95 shadow-sm'
          )}
        >
          {isSubmitting ? (
            <Loader2 size={16} className="animate-spin text-background" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>

      <div className="flex items-center justify-between px-1 text-[10px] text-textMuted/50 select-none">
        <span>Enter to send · Shift+Enter for new line</span>
        <span>Max image: 500 KB</span>
      </div>
    </div>
  );
}
