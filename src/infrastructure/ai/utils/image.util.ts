import { GeneratedAiImage } from '../../../application';
import { AiImageInput } from '../interfaces/ai-media.types';

export function stripDataUrl(base64: string): string {
  const idx = base64.indexOf('base64,');
  return idx >= 0 ? base64.slice(idx + 7) : base64.replace(/\s/g, '');
}

export function mimeToImageFormat(mimeType: string): 'jpeg' | 'png' | 'gif' | 'webp' {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('webp')) return 'webp';
  return 'jpeg';
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function toImageBytes(image: AiImageInput): Uint8Array {
  return Uint8Array.from(Buffer.from(stripDataUrl(image.base64), 'base64'));
}

export function toGeneratedImage(base64: string, mimeType = 'image/png'): GeneratedAiImage {
  return { base64, mimeType };
}
