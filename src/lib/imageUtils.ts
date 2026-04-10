import { toast } from 'react-hot-toast';

export const MAX_IMAGE_INPUT_MB = 20;
export const MAX_IMAGE_UPLOAD_MB = 8;
export const COMPRESS_MIN_BYTES = 350 * 1024; // 350KB
export const COMPRESS_MAX_DIM = 1024;
export const COMPRESS_QUALITY = 0.82;

/**
 * Validates a file before compression
 */
export const validateImageFile = (file: File): string | null => {
  if (!file.type.startsWith('image/')) return 'Arquivo inválido. Envie uma imagem.';
  const maxInputBytes = MAX_IMAGE_INPUT_MB * 1024 * 1024;
  if (file.size > maxInputBytes) return `Imagem muito grande. Máximo: ${MAX_IMAGE_INPUT_MB}MB.`;
  return null;
};

/**
 * Validates a file after compression
 */
export const validatePreparedImageFile = (file: File): string | null => {
  const maxUploadBytes = MAX_IMAGE_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxUploadBytes) return `Não foi possível otimizar o suficiente. Tente uma imagem menor (máximo ${MAX_IMAGE_UPLOAD_MB}MB após compactação).`;
  return null;
};

/**
 * Strips accents and replaces spaces/special chars for safe filenames in Supabase/CDN
 */
export const sanitizeFileBaseName = (name: string) => {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
};

/**
 * Converts a file to base64 data URL as a fallback if upload fails
 */
export const fileToDataUrl = async (file: File): Promise<string | null> => {
  try {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  } catch {
    return null;
  }
};

/**
 * Compresses and resizes an image before upload.
 * Prefers WebP format for high performance.
 */
export const prepareImageForUpload = async (file: File): Promise<File> => {
  if (!file.type.startsWith('image/')) return file;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });

  const maxDim = Math.max(image.width, image.height);
  const scale = Math.min(1, COMPRESS_MAX_DIM / maxDim);
  const shouldResize = scale < 1;
  const shouldReencode = file.size >= COMPRESS_MIN_BYTES;
  
  if (!shouldResize && !shouldReencode) return file;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  // We prefer WebP for smaller payloads and faster loading
  const outputType = 'image/webp';
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, outputType, COMPRESS_QUALITY);
  });
  
  if (!blob) return file;
  if (blob.size >= file.size && !shouldResize) return file;

  const ext = 'webp';
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const fileName = `${baseName}_optimized.${ext}`;
  return new File([blob], fileName, { type: outputType });
};
