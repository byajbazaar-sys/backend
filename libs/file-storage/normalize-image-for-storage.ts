import { BadRequestException } from '@nestjs/common';
import * as FileType from 'file-type';
import type { FileTypeResult } from 'file-type';
import convert from 'heic-convert';

const HEIC_MIMES = new Set(['image/heic', 'image/heif', 'image/heif-sequence']);

function looksHeicByFilename(name?: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower.endsWith('.heic') || lower.endsWith('.heif');
}

export type NormalizedImageForStorage = {
  buffer: Buffer;
  mimetype: string;
  fileExtension: string;
};

/**
 * HEIC/HEIF buffers often fail file-type detection or are rejected downstream.
 * Convert to JPEG so S3 storage validation (buffer sniffing) and clients stay consistent.
 */
export async function normalizeImageBufferForStorage(
  buffer: Buffer,
  declaredMime: string,
  originalFilename?: string,
): Promise<NormalizedImageForStorage> {
  const mimeLower = (declaredMime || '').toLowerCase();
  let fromBuffer: FileTypeResult | undefined;
  try {
    fromBuffer = (await FileType.fromBuffer(buffer)) ?? undefined;
  } catch {
    fromBuffer = undefined;
  }

  const isHeicMime =
    HEIC_MIMES.has(mimeLower) ||
    mimeLower.startsWith('image/heif') ||
    (mimeLower === 'application/octet-stream' && looksHeicByFilename(originalFilename));

  const isHeicDetected =
    fromBuffer &&
    (fromBuffer.mime === 'image/heic' ||
      fromBuffer.mime === 'image/heif' ||
      fromBuffer.ext === 'heic');

  if (!isHeicMime && !isHeicDetected) {
    const ext =
      mimeLower.split('/')[1]?.split(';')[0]?.split('+')[0] || fromBuffer?.ext || 'bin';
    return {
      buffer,
      mimetype: declaredMime || fromBuffer?.mime || 'application/octet-stream',
      fileExtension: ext,
    };
  }

  const jpegOut = await convert({ buffer, format: 'JPEG', quality: 0.92 });
  return {
    buffer: Buffer.from(jpegOut),
    mimetype: 'image/jpeg',
    fileExtension: 'jpeg',
  };
}

export async function normalizeImageBufferForStorageOrThrow(
  buffer: Buffer,
  declaredMime: string,
  originalFilename?: string,
): Promise<NormalizedImageForStorage> {
  try {
    return await normalizeImageBufferForStorage(buffer, declaredMime, originalFilename);
  } catch {
    throw new BadRequestException('Invalid image file');
  }
}
