import sharp from 'sharp';

const WHITE_THRESHOLD = 245;

/** Near-white or neutral light grey — common in AI "fake transparency" checkerboards. */
function isBackdropCandidate(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max >= WHITE_THRESHOLD && min >= WHITE_THRESHOLD) return true;
  // e.g. #d4d4d8 checker squares from model output
  return max >= 175 && min >= 165 && max - min <= 18;
}

/** Flood-fill from image borders through backdrop-like pixels only. */
function markExteriorBackdrop(data: Buffer, width: number, height: number): Uint8Array {
  const external = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const idx = (x: number, y: number) => y * width + x;

  const tryEnqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = idx(x, y);
    if (visited[i]) return;
    const o = i * 4;
    if (!isBackdropCandidate(data[o], data[o + 1], data[o + 2])) return;
    visited[i] = 1;
    external[i] = 1;
    queue.push(i);
  };

  for (let x = 0; x < width; x++) {
    tryEnqueue(x, 0);
    tryEnqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryEnqueue(0, y);
    tryEnqueue(width - 1, y);
  }

  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    tryEnqueue(x - 1, y);
    tryEnqueue(x + 1, y);
    tryEnqueue(x, y - 1);
    tryEnqueue(x, y + 1);
  }

  return external;
}

/**
 * Final polish: make exterior backdrop pixels transparent.
 * Handles near-white JPEG halos and grey/white checkerboards some models bake in.
 */
export async function ensureTransparentProductPng(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const exterior = markExteriorBackdrop(data, info.width, info.height);

  for (let i = 0; i < exterior.length; i++) {
    if (exterior[i]) data[i * 4 + 3] = 0;
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/** Keep API preview payloads under Lambda's 6MB response limit. */
export async function compressPngForApiPreview(buffer: Buffer, maxDimension = 1024): Promise<Buffer> {
  return sharp(buffer)
    .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}
