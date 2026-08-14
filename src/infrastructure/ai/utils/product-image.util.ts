import sharp from 'sharp';

const WHITE_THRESHOLD = 245;
/** Max RGB distance treated as background (solid studio backdrops). */
const HARD_BG_DISTANCE = 38;
/** Soft feather beyond hard cutoff (final alpha cutout). */
const SOFT_BG_DISTANCE = 80;
/** Looser match when flattening coloured studio backdrops to white. */
const FLATTEN_SOFT_BG_DISTANCE = 115;
/** Max area (px) for isolated backdrop islands removed during white flatten. */
const MAX_BACKDROP_SPECKLE_AREA = 64;

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

function luminance(pixel: Rgb): number {
  return 0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b;
}

function saturation(pixel: Rgb): number {
  const max = Math.max(pixel.r, pixel.g, pixel.b);
  const min = Math.min(pixel.r, pixel.g, pixel.b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Keep gold/metal/plastic folds; exclude light studio backdrops. */
function isClearlyProduct(pixel: Rgb, bg: Rgb): boolean {
  if (isNearWhite(pixel)) return false;

  const lum = luminance(pixel);
  const sat = saturation(pixel);

  if (lum < 92) return true;
  if (sat >= 0.16 && lum >= 85 && lum <= 232 && rgbDistance(pixel, bg) >= 48) return true;

  return false;
}

/** Non-white exterior studio backdrop (pink, grey, cream, shadows on backdrop). */
function isFlattenBackdrop(pixel: Rgb, bg: Rgb): boolean {
  if (isClearlyProduct(pixel, bg)) return false;
  if (isNearWhite(pixel)) return true;
  if (rgbDistance(pixel, bg) < FLATTEN_SOFT_BG_DISTANCE) return true;

  const lum = luminance(pixel);
  const sat = saturation(pixel);
  if (lum >= 150 && sat < 0.42) return true;

  return false;
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

/**
 * Flood-fill from image borders through backdrop-like pixels only.
 * Keeps enclosed studio-coloured regions inside filigree (not connected to the border).
 */
function markExternalBackdrop(
  data: Buffer,
  width: number,
  height: number,
  bg: Rgb,
  isBackdrop: (pixel: Rgb, backdrop: Rgb) => boolean,
): Uint8Array {
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
    if (!isBackdrop(pixel, bg)) return;
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

function markExternalBackground(data: Buffer, width: number, height: number, bg: Rgb): Uint8Array {
  return markExternalBackdrop(data, width, height, bg, isBackgroundLike);
}

function markExternalFlattenBackground(data: Buffer, width: number, height: number, bg: Rgb): Uint8Array {
  return markExternalBackdrop(data, width, height, bg, isFlattenBackdrop);
}

const PURE_WHITE: Rgb = { r: 255, g: 255, b: 255 };

function readPixel(data: Buffer, pixelIndex: number): Rgb {
  const o = pixelIndex * 4;
  return { r: data[o], g: data[o + 1], b: data[o + 2] };
}

function forcePixelWhite(data: Buffer, pixelIndex: number): void {
  const o = pixelIndex * 4;
  data[o] = 255;
  data[o + 1] = 255;
  data[o + 2] = 255;
  data[o + 3] = 255;
}

function isWhiteish(pixel: Rgb): boolean {
  return pixel.r >= 238 && pixel.g >= 238 && pixel.b >= 238;
}

function mergeExternalMasks(...masks: Uint8Array[]): Uint8Array {
  const merged = new Uint8Array(masks[0].length);
  for (const mask of masks) {
    for (let i = 0; i < merged.length; i++) {
      if (mask[i]) merged[i] = 1;
    }
  }
  return merged;
}

/** Remove isolated dark/coloured specks sitting on an otherwise white backdrop. */
function purgeBackdropSpeckles(data: Buffer, width: number, height: number, bg: Rgb): void {
  const idx = (x: number, y: number) => y * width + x;
  const total = width * height;

  for (let i = 0; i < total; i++) {
    if (luminance(readPixel(data, i)) >= 234) forcePixelWhite(data, i);
  }

  for (let pass = 0; pass < 6; pass++) {
    const toWhite: number[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(x, y);
        const p = readPixel(data, i);
        if (isWhiteish(p) || isClearlyProduct(p, bg)) continue;

        let whiteNeighbors = 0;
        let lightNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const np = readPixel(data, idx(nx, ny));
            if (isWhiteish(np)) whiteNeighbors++;
            if (luminance(np) >= 208) lightNeighbors++;
          }
        }

        if (whiteNeighbors >= 6) toWhite.push(i);
        else if (luminance(p) < 195 && lightNeighbors >= 7) toWhite.push(i);
        else if (lightNeighbors >= 7 && luminance(p) >= 165) toWhite.push(i);
      }
    }

    if (toWhite.length === 0) break;
    for (const i of toWhite) forcePixelWhite(data, i);
  }
}

/** Erase tiny non-product islands that sit on the flattened white backdrop. */
function removeSmallBackdropIslands(data: Buffer, width: number, height: number, bg: Rgb): void {
  const total = width * height;
  const visited = new Uint8Array(total);
  const idx = (x: number, y: number) => y * width + x;

  for (let start = 0; start < total; start++) {
    if (visited[start]) continue;

    const startPixel = readPixel(data, start);
    if (isWhiteish(startPixel) || isClearlyProduct(startPixel, bg)) {
      visited[start] = 1;
      continue;
    }

    const queue = [start];
    const component: number[] = [];
    visited[start] = 1;
    let head = 0;
    let touchesWhite = false;

    while (head < queue.length) {
      const i = queue[head++];
      component.push(i);
      const x = i % width;
      const y = (i - x) / width;

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
        if (visited[ni]) continue;

        const np = readPixel(data, ni);
        if (isWhiteish(np)) {
          touchesWhite = true;
          continue;
        }
        if (isClearlyProduct(np, bg)) {
          visited[ni] = 1;
          continue;
        }

        visited[ni] = 1;
        queue.push(ni);
      }
    }

    if (touchesWhite && component.length <= MAX_BACKDROP_SPECKLE_AREA) {
      for (const i of component) forcePixelWhite(data, i);
    }
  }
}

function prepareFlattenedWhiteBackdrop(data: Buffer, width: number, height: number, bg: Rgb): void {
  const external = mergeExternalMasks(
    markExternalFlattenBackground(data, width, height, bg),
    markExternalBackground(data, width, height, bg),
  );

  normalizeExternalToWhite(data, external);
  expandExternalWhiteMask(data, width, height, external);
  purgeBackdropSpeckles(data, width, height, bg);
  removeSmallBackdropIslands(data, width, height, bg);
  purgeBackdropSpeckles(data, width, height, bg);
}

/** Flatten detected exterior backdrop to #FFFFFF before alpha cutout. */
function normalizeExternalToWhite(data: Buffer, external: Uint8Array): void {
  for (let i = 0; i < external.length; i++) {
    if (!external[i]) continue;
    const o = i * 4;
    data[o] = 255;
    data[o + 1] = 255;
    data[o + 2] = 255;
  }
}

function applyExternalTransparency(data: Buffer, external: Uint8Array): void {
  for (let i = 0; i < external.length; i++) {
    if (!external[i]) continue;
    data[i * 4 + 3] = 0;
  }
}

function expandExternalWhiteMask(
  data: Buffer,
  width: number,
  height: number,
  external: Uint8Array,
): void {
  const expanded = markExternalBackground(data, width, height, PURE_WHITE);
  for (let i = 0; i < expanded.length; i++) {
    if (expanded[i]) external[i] = 1;
  }
  normalizeExternalToWhite(data, external);
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
 * Preview step: replace the exterior studio backdrop with pure white, keeping the product opaque.
 * Already-cutout PNGs are composited onto white instead of re-segmenting.
 */
export async function flattenExteriorBackgroundToWhite(buffer: Buffer): Promise<Buffer> {
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
  const bg = sampleBackgroundColor(data, info.width, info.height);
  prepareFlattenedWhiteBackdrop(data, info.width, info.height, bg);

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
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
  const { data, info } = await loadProductRaster(buffer);

  const bg = sampleBackgroundColor(data, info.width, info.height);
  let external = mergeExternalMasks(
    markExternalFlattenBackground(data, info.width, info.height, bg),
    markExternalBackground(data, info.width, info.height, bg),
  );

  // Pass 1: homogenize exterior backdrop to pure white (handles gradients/shadows).
  normalizeExternalToWhite(data, external);

  // Pass 2: expand mask through newly white pixels, then cut alpha.
  expandExternalWhiteMask(data, info.width, info.height, external);
  applyExternalTransparency(data, external);

  purgeBackdropSpeckles(data, info.width, info.height, bg);
  removeSmallBackdropIslands(data, info.width, info.height, bg);

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
