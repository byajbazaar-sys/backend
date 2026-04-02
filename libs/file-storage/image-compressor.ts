import * as FileType from 'file-type';
import sharp from 'sharp';

const MIN_BYTES_TO_COMPRESS = 200 * 1024;
const MAX_WIDTH = 1920;
/** Target quality within 70–80 range */
const JPEG_WEBP_QUALITY = 75;

function normalizeMime(mimetype?: string | null): string {
  if (!mimetype) return '';
  return mimetype.toLowerCase().split(';')[0].trim();
}

/**
 * Lossy-ish resize + re-encode for photos. GIF (animation) and SVG are left unchanged.
 * Buffers under 200KB are not processed. On any failure, returns the original buffer.
 */
export async function compressImage(buffer: Buffer, mimetype?: string | null): Promise<Buffer> {
  let mime = normalizeMime(mimetype);
  if (!mime) {
    try {
      const ft = await FileType.fromBuffer(buffer);
      mime = ft?.mime ? normalizeMime(ft.mime) : '';
    } catch {
      return buffer;
    }
  }
  if (!mime.startsWith('image/')) return buffer;
  if (mime === 'image/gif' || mime === 'image/svg+xml') return buffer;
  if (buffer.length < MIN_BYTES_TO_COMPRESS) return buffer;

  try {
    const pipeline = sharp(buffer).rotate().resize({
      width: MAX_WIDTH,
      withoutEnlargement: true,
    });

    let out: Buffer;
    if (mime.includes('png')) {
      out = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    } else if (mime.includes('webp')) {
      out = await pipeline.webp({ quality: JPEG_WEBP_QUALITY }).toBuffer();
    } else {
      out = await pipeline.jpeg({ quality: JPEG_WEBP_QUALITY, mozjpeg: true }).toBuffer();
    }

    if (out.length >= buffer.length) return buffer;
    return out;
  } catch {
    return buffer;
  }
}
