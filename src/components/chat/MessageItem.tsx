import { useState } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, AlertCircle, RefreshCw, Loader2, Image as ImageIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ChatMessage } from '../../hooks/useChat';

interface MessageItemProps {
  message: ChatMessage;
  isOutgoing: boolean;
  otherUserLastReadAt: string | null;
  otherUserLastDeliveredAt?: string | null;
  onRetry?: (message: ChatMessage) => void;
  onOpenImage?: (url: string) => void;
}

export function MessageItem({
  message,
  isOutgoing,
  otherUserLastReadAt,
  otherUserLastDeliveredAt,
  onRetry,
  onOpenImage
}: MessageItemProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  const formattedTime = format(new Date(message.created_at), 'p');

  const isRead =
    isOutgoing &&
    message.status === 'sent' &&
    !!otherUserLastReadAt &&
    new Date(otherUserLastReadAt) >= new Date(message.created_at);

  const isDelivered =
    isOutgoing &&
    message.status === 'sent' &&
    !!otherUserLastDeliveredAt &&
    new Date(otherUserLastDeliveredAt) >= new Date(message.created_at);

  const imageUrl = message.localPreviewUrl || message.signedImageUrl;

  return (
    <div
      className={cn(
        'w-full flex flex-col group transition-all duration-200',
        isOutgoing ? 'items-end' : 'items-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] sm:max-w-[75%] md:max-w-[65%] rounded-2xl p-3.5 transition-all relative',
          isOutgoing
            ? 'bg-surface/90 border border-border/50 text-textMain rounded-br-sm shadow-sm'
            : 'bg-surface/30 border border-border/25 text-textMain rounded-bl-sm'
        )}
      >
        {/* IMAGE ATTACHMENT */}
        {message.message_type === 'image' && (
          <div className="flex flex-col gap-1.5">
            <div
              onClick={() => imageUrl && onOpenImage?.(imageUrl)}
              className={cn(
                'relative overflow-hidden rounded-xl bg-background/50 border border-border/20 cursor-pointer min-h-[140px] max-h-[320px] flex items-center justify-center group/img',
                !imageUrl && 'animate-pulse'
              )}
            >
              {!imageLoaded && imageUrl && (
                <div className="absolute inset-0 flex items-center justify-center bg-surface/40">
                  <Loader2 size={20} className="animate-spin text-textMuted" />
                </div>
              )}

              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Attachment"
                  onLoad={() => setImageLoaded(true)}
                  className={cn(
                    'max-h-[320px] w-auto object-cover rounded-xl transition-transform duration-300 group-hover/img:scale-[1.02]',
                    !imageLoaded && 'opacity-0'
                  )}
                />
              ) : (
                <div className="p-8 flex flex-col items-center gap-2 text-textMuted">
                  <ImageIcon size={24} />
                  <span className="text-[11px] font-medium">Loading image...</span>
                </div>
              )}
            </div>

            {message.image_metadata?.size && (
              <span className="text-[9px] font-mono text-textMuted/60 px-1">
                {Math.round(message.image_metadata.size / 1000)} KB
              </span>
            )}
          </div>
        )}

        {/* TEXT CONTENT */}
        {message.text_content && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words font-medium select-text">
            {message.text_content}
          </p>
        )}

        {/* METADATA FOOTER (TIME & READ STATUS) */}
        <div
          className={cn(
            'flex items-center gap-1.5 mt-1.5 pt-0.5 text-[10px] font-medium tracking-wider select-none',
            isOutgoing ? 'justify-end text-textMuted/70' : 'justify-start text-textMuted/50'
          )}
        >
          <span>{formattedTime}</span>

          {isOutgoing && (
            <span className="flex items-center ml-0.5">
              {message.status === 'sending' && (
                <Loader2 size={11} className="animate-spin text-accent" />
              )}
              {message.status === 'error' && (
                <button
                  onClick={() => onRetry?.(message)}
                  className="text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                  title={message.errorMessage || 'Failed to send. Click to retry.'}
                >
                  <AlertCircle size={12} />
                  <RefreshCw size={10} className="ml-0.5" />
                </button>
              )}
              {message.status === 'sent' && (
                isRead ? (
                  <span title="Read" className="text-accent flex items-center">
                    <CheckCheck size={13} />
                  </span>
                ) : isDelivered ? (
                  <span title="Delivered" className="text-textMuted/70 flex items-center">
                    <CheckCheck size={13} />
                  </span>
                ) : (
                  <span title="Sent to server" className="text-textMuted/60 flex items-center">
                    <Check size={13} />
                  </span>
                )
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
