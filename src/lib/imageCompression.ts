/**
 * Strict Image Compression & Validation Utility for Eustace Messaging
 * Enforces:
 * - Decodable raster image formats: JPEG, PNG, WebP
 * - Strict maximum byte limit: 500,000 bytes (500 KB decimal)
 * - Dimension constraint (max 1600px longest edge)
 * - Safe canvas-based compression & progressive downscaling
 */

export const MAX_IMAGE_BYTES = 500_000; // 500 KB decimal limit

export interface CompressedImageResult {
  file: File;
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

/**
 * Validates that the file is a supported image and can be decoded by the browser.
 */
export async function validateAndLoadImage(file: File): Promise<HTMLImageElement> {
  const mime = file.type.toLowerCase();
  if (!SUPPORTED_MIME_TYPES.has(mime)) {
    throw new Error('Unsupported image format. Please select a JPG, PNG, or WebP image.');
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        reject(new Error('Corrupted or non-decodable image file.'));
      } else {
        resolve(img);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image. File might be corrupted or not a valid image.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Calculates constrained dimensions while preserving aspect ratio.
 */
export function calculateConstrainedDimensions(
  width: number,
  height: number,
  maxDimension: number = 1600
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  if (width >= height) {
    const newWidth = maxDimension;
    const newHeight = Math.round((height * maxDimension) / width);
    return { width: newWidth, height: newHeight };
  } else {
    const newHeight = maxDimension;
    const newWidth = Math.round((width * maxDimension) / height);
    return { width: newWidth, height: newHeight };
  }
}

/**
 * Compresses an image to ensure it strictly stays under 500,000 bytes.
 */
export async function compressImageToLimit(
  file: File,
  onProgress?: (stage: string) => void
): Promise<CompressedImageResult> {
  onProgress?.('Verifying image format...');
  const img = await validateAndLoadImage(file);

  onProgress?.('Analyzing dimensions...');
  let maxDimension = 1600;
  let quality = 0.85;
  // Use WebP if supported, otherwise JPEG.
  const outputMime = 'image/webp';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available.');
  }

  let finalBlob: Blob | null = null;
  let finalWidth = img.naturalWidth;
  let finalHeight = img.naturalHeight;

  // Progressive compression loop (max 6 attempts)
  for (let attempt = 1; attempt <= 6; attempt++) {
    onProgress?.(`Compressing image (attempt ${attempt}/6)...`);
    const { width, height } = calculateConstrainedDimensions(img.naturalWidth, img.naturalHeight, maxDimension);
    finalWidth = width;
    finalHeight = height;

    canvas.width = width;
    canvas.height = height;

    // Clear and draw
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), outputMime, quality);
    });

    if (!blob) {
      // Fallback to image/jpeg if WebP conversion fails
      const fallbackBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
      });
      if (!fallbackBlob) {
        throw new Error('Image compression failed.');
      }
      if (fallbackBlob.size <= MAX_IMAGE_BYTES) {
        finalBlob = fallbackBlob;
        break;
      }
    } else if (blob.size <= MAX_IMAGE_BYTES) {
      finalBlob = blob;
      break;
    }

    // Still too large, adjust parameters for next attempt
    if (attempt === 1) {
      quality = 0.75;
    } else if (attempt === 2) {
      maxDimension = 1200;
      quality = 0.70;
    } else if (attempt === 3) {
      maxDimension = 1000;
      quality = 0.60;
    } else if (attempt === 4) {
      maxDimension = 800;
      quality = 0.50;
    } else if (attempt === 5) {
      maxDimension = 640;
      quality = 0.40;
    }
  }

  if (!finalBlob || finalBlob.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image exceeds the maximum allowed size of 500 KB (${MAX_IMAGE_BYTES.toLocaleString()} bytes) after compression. Please select a smaller image.`
    );
  }

  // Create clean filename with appropriate extension
  const extension = finalBlob.type === 'image/webp' ? 'webp' : 'jpg';
  const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'image';
  const cleanFileName = `${baseName}_compressed.${extension}`;

  const compressedFile = new File([finalBlob], cleanFileName, {
    type: finalBlob.type,
    lastModified: Date.now()
  });

  const previewUrl = URL.createObjectURL(finalBlob);

  return {
    file: compressedFile,
    blob: finalBlob,
    previewUrl,
    width: finalWidth,
    height: finalHeight,
    sizeBytes: finalBlob.size
  };
}
