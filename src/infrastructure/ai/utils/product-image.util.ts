import sharp from 'sharp';

const WHITE_THRESHOLD = 245;
/** Max RGB distance from pure white for backdrop removal on save. */
const WHITE_KEY_TOLERANCE = 7;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function readPixel(data: Buffer, index: number): Rgb {
  const o = index * 4;
  return { r: data[o], g: data[o + 1], b: data[o + 2] };
}

function whiteDistance(r: number, g: number, b: number): number {
  return Math.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2);
}

function isWhitePixel(r: number, g: number, b: number): boolean {
  return r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
}

/** Studio backdrop only — tight match to #FFFFFF so gems/highlights are not selected. */
function isStrictBackdropWhite(r: number, g: number, b: number): boolean {
  return whiteDistance(r, g, b) <= WHITE_KEY_TOLERANCE;
}

/** Near-white or neutral light grey — AI checkerboards and leftover studio tones (preview normalize only). */
function isBackdropCandidate(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (isWhitePixel(r, g, b)) return true;
  return max >= 175 && min >= 165 && max - min <= 18;
}

/** Gold, coloured stones, dark metal — never treat as removable backdrop. */
function isProductPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;

  if (spread >= 10) return true;
  if (max < 140) return true;
  if (r > g + 5 && r > b + 5 && max > 85) return true;

  return false;
}

function markExteriorPixels(
  data: Buffer,
  width: number,
  height: number,
  matches: (r: number, g: number, b: number) => boolean,
  blocked?: (r: number, g: number, b: number) => boolean,
): Uint8Array {
  const external = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const idx = (x: number, y: number) => y * width + x;

  const tryEnqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = idx(x, y);
    if (visited[i]) return;
    const pixel = readPixel(data, i);
    if (blocked?.(pixel.r, pixel.g, pixel.b)) return;
    if (!matches(pixel.r, pixel.g, pixel.b)) return;
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

/** Peel backdrop pixels that touch product-coloured neighbours (protects diamonds at edges). */
function peelBackdropFromProductEdges(
  data: Buffer,
  width: number,
  height: number,
  exterior: Uint8Array,
): void {
  const idx = (x: number, y: number) => y * width + x;

  for (let pass = 0; pass < 24; pass++) {
    const toPeel: number[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(x, y);
        if (!exterior[i]) continue;

        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = idx(nx, ny);
          if (exterior[ni]) continue;

          const neighbor = readPixel(data, ni);
          if (isProductPixel(neighbor.r, neighbor.g, neighbor.b)) {
            toPeel.push(i);
            break;
          }
        }
      }
    }

    if (toPeel.length === 0) break;
    for (const i of toPeel) exterior[i] = 0;
  }
}

/**
 * Bright white gems often have subtle facet variation; flat studio white does not.
 * Protect high-variance bright regions from backdrop removal.
 */
function protectTexturedBrightRegions(
  data: Buffer,
  width: number,
  height: number,
  exterior: Uint8Array,
): void {
  const idx = (x: number, y: number) => y * width + x;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y);
      if (!exterior[i]) continue;

      const center = readPixel(data, i);
      if (!isWhitePixel(center.r, center.g, center.b)) continue;

      let samples = 0;
      let spreadSum = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const p = readPixel(data, idx(nx, ny));
          if (!isWhitePixel(p.r, p.g, p.b)) continue;
          samples++;
          spreadSum += Math.max(p.r, p.g, p.b) - Math.min(p.r, p.g, p.b);
        }
      }

      if (samples >= 4 && spreadSum / samples >= 2.5) {
        exterior[i] = 0;
      }
    }
  }
}

async function loadProductRaster(buffer: Buffer) {
  return sharp(buffer)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function bordersMostlyTransparent(data: Buffer, width: number, height: number): boolean {
  let transparent = 0;
  let samples = 0;
  const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3];

  for (let x = 0; x < width; x++) {
    samples += 2;
    if (alphaAt(x, 0) < 16) transparent++;
    if (alphaAt(x, height - 1) < 16) transparent++;
  }
  for (let y = 0; y < height; y++) {
    samples += 2;
    if (alphaAt(0, y) < 16) transparent++;
    if (alphaAt(width - 1, y) < 16) transparent++;
  }

  return samples > 0 && transparent / samples > 0.4;
}

/**
 * Normalize AI output to a solid #FFFFFF backdrop (preview step).
 * Flattens transparency, checkerboards, and leftover studio colours to pure white.
 */
export async function ensureWhiteProductPng(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  if (meta.hasAlpha) {
    const sample = await sharp(buffer)
      .rotate()
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (bordersMostlyTransparent(sample.data, sample.info.width, sample.info.height)) {
      return sharp(buffer)
        .rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
    }
  }

  const { data, info } = await loadProductRaster(buffer);
  const exterior = markExteriorPixels(data, info.width, info.height, isBackdropCandidate);

  for (let i = 0; i < exterior.length; i++) {
    if (!exterior[i]) continue;
    const o = i * 4;
    data[o] = 255;
    data[o + 1] = 255;
    data[o + 2] = 255;
    data[o + 3] = 255;
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/**
 * Remove exterior #FFFFFF backdrop for try-on storage (save step).
 * Uses a tight white chroma key from image borders and protects product pixels.
 */
export async function removeWhiteBackground(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await loadProductRaster(buffer);
  const exterior = markExteriorPixels(
    data,
    info.width,
    info.height,
    isStrictBackdropWhite,
    isProductPixel,
  );

  peelBackdropFromProductEdges(data, info.width, info.height, exterior);
  protectTexturedBrightRegions(data, info.width, info.height, exterior);

  for (let i = 0; i < exterior.length; i++) {
    if (exterior[i]) data[i * 4 + 3] = 0;
  }

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

/** True when image borders are mostly white (already AI-processed preview file). */
export async function hasWhiteStudioBackground(buffer: Buffer): Promise<boolean> {
  const sample = await sharp(buffer)
    .rotate()
    .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = sample;
  let white = 0;
  let samples = 0;
  const at = (x: number, y: number) => {
    const o = (y * info.width + x) * 3;
    samples++;
    if (isStrictBackdropWhite(data[o], data[o + 1], data[o + 2])) white++;
  };

  for (let x = 0; x < info.width; x++) {
    at(x, 0);
    at(x, info.height - 1);
  }
  for (let y = 0; y < info.height; y++) {
    at(0, y);
    at(info.width - 1, y);
  }

  return samples > 0 && white / samples >= 0.7;
}

/** Keep API preview payloads under Lambda's 6MB response limit. */
export async function compressPngForApiPreview(buffer: Buffer, maxDimension = 1024): Promise<Buffer> {
  return sharp(buffer)
    .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}
