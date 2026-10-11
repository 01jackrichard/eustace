import toast from 'react-hot-toast';

/**
 * Deduplicated, user-friendly error toast dispatcher.
 * Prevents toast flooding by assigning stable IDs and sanitizing raw technical errors.
 */
export function showErrorToast(
  error: unknown,
  fallbackMessage: string = 'An unexpected error occurred.',
  toastId: string = 'general_chat_error'
): string {
  const rawMsg =
    typeof error === 'string'
      ? error
      : (error as any)?.message || (error as any)?.error_description || String(error || '');

  let friendlyMessage = fallbackMessage;

  if (
    rawMsg.includes('Failed to fetch') ||
    rawMsg.includes('NetworkError') ||
    rawMsg.includes('Load failed') ||
    rawMsg.includes('network')
  ) {
    friendlyMessage = 'Network connection issue. Please check your internet connection.';
  } else if (
    rawMsg.includes('unique constraint') ||
    rawMsg.includes('duplicate key') ||
    rawMsg.includes('conversations_unique_pair')
  ) {
    friendlyMessage = 'Conversation is already being opened.';
  } else if (rawMsg.includes('500,000 bytes') || rawMsg.includes('500 KB')) {
    friendlyMessage = 'Image must be 500 KB or less. Please choose a smaller image.';
  } else if (rawMsg.includes('not accepted friends') || rawMsg.includes('friendship')) {
    friendlyMessage = 'Direct messaging is only available between accepted friends.';
  } else if (rawMsg.includes('Not authenticated')) {
    friendlyMessage = 'Your session expired. Please sign in again.';
  } else if (rawMsg.trim().length > 0 && !rawMsg.includes('TypeError') && !rawMsg.includes('PostgrestError')) {
    friendlyMessage = rawMsg;
  }

  return toast.error(friendlyMessage, {
    id: toastId,
    duration: 4000
  });
}

export function showSuccessToast(message: string, toastId?: string): string {
  return toast.success(message, {
    id: toastId,
    duration: 3000
  });
}

export function dismissToast(toastId: string): void {
  toast.dismiss(toastId);
}
