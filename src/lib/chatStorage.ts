import { supabase } from './supabase';

interface CachedSignedUrl {
  url: string;
  expiresAt: number; // epoch ms
}

const signedUrlCache = new Map<string, CachedSignedUrl>();

/**
 * Retrieves a secure, short-lived signed URL for an image in the private message-images bucket.
 * Caches URLs to avoid repeated redundant API calls on every render.
 */
export async function getSignedMessageImageUrl(
  imagePath: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  if (!imagePath) return '';

  const clean = imagePath.trim();
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }

  // Strip accidental leading slashes and bucket name prefix
  const relativePath = clean.replace(/^\/+/, '').replace(/^message-images\//, '').replace(/^\/+/, '');
  if (!relativePath) return '';

  const now = Date.now();
  const cached = signedUrlCache.get(relativePath);

  // Return cached if valid for at least 5 more minutes
  if (cached && cached.expiresAt > now + 300_000) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from('message-images')
    .createSignedUrl(relativePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.error('Failed to create signed URL for message image:', error);
    throw error || new Error('Could not generate secure image URL');
  }

  signedUrlCache.set(relativePath, {
    url: data.signedUrl,
    expiresAt: now + expiresInSeconds * 1000
  });

  return data.signedUrl;
}

/**
 * Uploads a validated, compressed image (< 500 KB) into the private message-images bucket.
 */
export async function uploadMessageImage(
  conversationId: string,
  file: File,
  metadata?: Record<string, any>
): Promise<{ imagePath: string; metadata: Record<string, any> }> {
  const allowedMimes: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };

  const safeExt = allowedMimes[file.type.toLowerCase()];
  if (!safeExt) {
    throw new Error('Unsupported image format. Only JPEG, PNG, and WebP images are allowed.');
  }

  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const fileName = `${Date.now()}_${randomSuffix}.${safeExt}`;
  const imagePath = `${conversationId}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('message-images')
    .upload(imagePath, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false
    });

  if (error || !data) {
    console.error('Storage upload failed:', error);
    throw error || new Error('Failed to upload image attachment.');
  }

  return {
    imagePath: data.path || imagePath,
    metadata: {
      size: file.size,
      mime: file.type,
      ...metadata
    }
  };
}

/**
 * Safely cleans up an uploaded image from storage if message creation fails.
 */
export async function cleanupOrphanedMessageImage(imagePath: string): Promise<void> {
  try {
    if (!imagePath) return;
    await supabase.storage.from('message-images').remove([imagePath]);
    signedUrlCache.delete(imagePath);
  } catch (err) {
    console.warn('Failed to cleanup orphaned message image:', err);
  }
}
