import sharp from 'sharp';

const WHITE_THRESHOLD = 245;
/** Max RGB distance treated as background (solid studio backdrops). */
const HARD_BG_DISTANCE = 38;
/** Soft feather beyond hard cutoff. */
const SOFT_BG_DISTANCE = 72;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function isNearWhite(pixel: Rgb): boolean {
  return pixel.r >= WHITE_THRESHOLD && pixel.g >= WHITE_THRESHOLD && pixel.b >= WHITE_THRESHOLD;
}

function isBackgroundLike(pixel: Rgb, bg: Rgb): boolean {
  return isNearWhite(pixel) || rgbDistance(pixel, bg) < SOFT_BG_DISTANCE;
}

function sampleBackgroundColor(data: Buffer, width: number, height: number): Rgb {
  const samples: Rgb[] = [];
  const sampleAt = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  };

  const stepX = Math.max(1, Math.floor(width / 24));
  const stepY = Math.max(1, Math.floor(height / 24));

  for (let x = 0; x < width; x += stepX) {
    sampleAt(x, 0);
    sampleAt(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    sampleAt(0, y);
    sampleAt(width - 1, y);
  }

  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ] as const;
  for (const [x, y] of corners) {
    for (let dx = 0; dx <= 4; dx++) {
      for (let dy = 0; dy <= 4; dy++) {
        const sx = Math.min(width - 1, x + (x === 0 ? dx : -dx));
        const sy = Math.min(height - 1, y + (y === 0 ? dy : -dy));
        sampleAt(sx, sy);
      }
    }
  }

  const sortedR = [...samples].sort((a, b) => a.r - b.r);
  const sortedG = [...samples].sort((a, b) => a.g - b.g);
  const sortedB = [...samples].sort((a, b) => a.b - b.b);
  const mid = Math.floor(samples.length / 2);
  return {
    r: sortedR[mid].r,
    g: sortedG[mid].g,
    b: sortedB[mid].b,
  };
}

function alphaForBackgroundPixel(dist: number, existingAlpha: number): number {
  if (dist <= HARD_BG_DISTANCE) return 0;
  if (dist >= SOFT_BG_DISTANCE) return existingAlpha;
  const t = (dist - HARD_BG_DISTANCE) / (SOFT_BG_DISTANCE - HARD_BG_DISTANCE);
  return Math.round(existingAlpha * t);
}

/**
 * Flood-fill from image borders through background-like pixels only.
 * Keeps enclosed studio-coloured regions inside filigree (not connected to the border).
 */
function markExternalBackground(data: Buffer, width: number, height: number, bg: Rgb): Uint8Array {
  const external = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const idx = (x: number, y: number) => y * width + x;

  const tryEnqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = idx(x, y);
    if (visited[i]) return;
    const o = i * 4;
    const pixel = { r: data[o], g: data[o + 1], b: data[o + 2] };
    if (!isBackgroundLike(pixel, bg)) return;
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

function defringeHalos(data: Buffer, width: number, height: number, bg: Rgb): void {
  const alphaCopy = Buffer.alloc(data.length / 4);
  for (let i = 0; i < data.length; i += 4) {
    alphaCopy[i / 4] = data[i + 3];
  }

  const idx = (x: number, y: number) => y * width + x;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y);
      const o = i * 4;
      const alpha = alphaCopy[i];
      if (alpha === 0) continue;

      const pixel = { r: data[o], g: data[o + 1], b: data[o + 2] };
      const dist = rgbDistance(pixel, bg);
      if (dist >= HARD_BG_DISTANCE) continue;

      let hasTransparentNeighbor = false;
      for (let dy = -1; dy <= 1 && !hasTransparentNeighbor; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          if (alphaCopy[idx(nx, ny)] < 24) {
            hasTransparentNeighbor = true;
            break;
          }
        }
      }

      if (hasTransparentNeighbor) {
        const t = dist / HARD_BG_DISTANCE;
        data[o + 3] = Math.round(alpha * t * t);
      }
    }
  }
}

/**
 * Remove a solid / near-solid studio backdrop (white, pink, grey, etc.) and return PNG with alpha.
 * Uses border-connected flood fill so only exterior background is removed.
 */
export async function removeSolidColorBackground(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bg = sampleBackgroundColor(data, info.width, info.height);
  const external = markExternalBackground(data, info.width, info.height, bg);

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = y * info.width + x;
      if (!external[i]) continue;

      const o = i * 4;
      const pixel: Rgb = { r: data[o], g: data[o + 1], b: data[o + 2] };
      const dist = rgbDistance(pixel, bg);

      if (isNearWhite(pixel)) {
        data[o + 3] = 0;
      } else {
        data[o + 3] = alphaForBackgroundPixel(dist, data[o + 3]);
      }
    }
  }

  defringeHalos(data, info.width, info.height, bg);

  const cutout = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  try {
    return await sharp(cutout).trim({ threshold: 10 }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  } catch {
    return cutout;
  }
}

/**
 * Final polish: force near-white pixels transparent (legacy AI JPEG outputs).
 */
export async function ensureTransparentProductPng(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      data[i + 3] = 0;
    }
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
