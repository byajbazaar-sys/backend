import sharp from 'sharp';

const WHITE_THRESHOLD = 245;
const ALPHA_TRANSPARENT_THRESHOLD = 16;

function isWhitePixel(r: number, g: number, b: number): boolean {
  return r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
}

/** Neutral light grey — typical AI checkerboard tile (not pure white product highlights). */
function isGreyBackdropPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max >= 165 && max < WHITE_THRESHOLD && min >= 165 && max - min <= 18;
}

/** Near-white or neutral light grey — AI checkerboards and leftover studio tones. */
function isBackdropCandidate(r: number, g: number, b: number): boolean {
  return isWhitePixel(r, g, b) || isGreyBackdropPixel(r, g, b);
}

function markConnectedBackdropPixels(
  data: Buffer,
  width: number,
  height: number,
  seed: (x: number, y: number) => boolean,
): Uint8Array {
  const marked = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const idx = (x: number, y: number) => y * width + x;

  const tryEnqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = idx(x, y);
    if (visited[i]) return;
    if (!seed(x, y)) return;
    visited[i] = 1;
    marked[i] = 1;
    queue.push(i);
  };

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (seed(x, y)) tryEnqueue(x, y);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;

    const visit = (nx: number, ny: number) => {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
      const ni = idx(nx, ny);
      if (visited[ni]) return;
      const no = ni * 4;
      if (!isBackdropCandidate(data[no], data[no + 1], data[no + 2])) return;
      visited[ni] = 1;
      marked[ni] = 1;
      queue.push(ni);
    };

    visit(x - 1, y);
    visit(x + 1, y);
    visit(x, y - 1);
    visit(x, y + 1);
  }

  return marked;
}

function markExteriorPixels(
  data: Buffer,
  width: number,
  height: number,
  matches: (r: number, g: number, b: number) => boolean,
): Uint8Array {
  return markConnectedBackdropPixels(data, width, height, (x, y) => {
    const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    if (!onBorder) return false;
    const o = (y * width + x) * 4;
    return matches(data[o], data[o + 1], data[o + 2]);
  });
}

/** Interior checkerboard islands (e.g. ring holes) — grey tile present, not edge-connected. */
function markInteriorCheckerboardIslands(data: Buffer, width: number, height: number): Uint8Array {
  const visited = new Uint8Array(width * height);
  const remove = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (visited[i]) continue;
      const o = i * 4;
      if (!isBackdropCandidate(data[o], data[o + 1], data[o + 2])) continue;

      const queue: number[] = [i];
      const component: number[] = [];
      visited[i] = 1;
      let touchesBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      let hasGreyTile = isGreyBackdropPixel(data[o], data[o + 1], data[o + 2]);

      let head = 0;
      while (head < queue.length) {
        const ci = queue[head++];
        component.push(ci);
        const cx = ci % width;
        const cy = (ci - cx) / width;

        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ] as const) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = ny * width + nx;
          if (visited[ni]) continue;
          const no = ni * 4;
          if (!isBackdropCandidate(data[no], data[no + 1], data[no + 2])) continue;
          visited[ni] = 1;
          if (nx === 0 || ny === 0 || nx === width - 1 || ny === height - 1) touchesBorder = true;
          if (isGreyBackdropPixel(data[no], data[no + 1], data[no + 2])) hasGreyTile = true;
          queue.push(ni);
        }
      }

      if (!touchesBorder && hasGreyTile) {
        for (const ci of component) remove[ci] = 1;
      }
    }
  }

  return remove;
}

function applyBackdropRemoval(data: Buffer, mask: Uint8Array, mode: 'white' | 'transparent'): void {
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const o = i * 4;
    if (mode === 'white') {
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = 255;
    } else {
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = 0;
    }
  }
}

/** Force near-zero alpha to fully transparent and scrub leftover backdrop RGB. */
function enforceTransparentAlpha(data: Buffer): void {
  for (let o = 0; o < data.length; o += 4) {
    if (data[o + 3] >= ALPHA_TRANSPARENT_THRESHOLD) continue;
    data[o] = 0;
    data[o + 1] = 0;
    data[o + 2] = 0;
    data[o + 3] = 0;
  }
}

/** Grow transparency into adjacent neutral backdrop pixels (handles fringes / partial alpha). */
function markBackdropFromTransparentSeeds(data: Buffer, width: number, height: number): Uint8Array {
  return markConnectedBackdropPixels(data, width, height, (x, y) => {
    const alpha = data[(y * width + x) * 4 + 3];
    return alpha < ALPHA_TRANSPARENT_THRESHOLD;
  });
}

async function loadProductRaster(buffer: Buffer) {
  return sharp(buffer)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function stripExteriorBackdrop(buffer: Buffer, mode: 'white' | 'transparent'): Promise<Buffer> {
  const encodePng = (pipeline: sharp.Sharp) =>
    pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();

  const { data, info } = await loadProductRaster(buffer);

  if (mode === 'transparent') {
    enforceTransparentAlpha(data);
  }

  applyBackdropRemoval(data, markExteriorPixels(data, info.width, info.height, isBackdropCandidate), mode);

  if (mode === 'transparent') {
    applyBackdropRemoval(data, markBackdropFromTransparentSeeds(data, info.width, info.height), mode);
    applyBackdropRemoval(data, markInteriorCheckerboardIslands(data, info.width, info.height), mode);
    enforceTransparentAlpha(data);
  } else {
    applyBackdropRemoval(data, markInteriorCheckerboardIslands(data, info.width, info.height), mode);
  }

  const pipeline = sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  });
  if (mode === 'white') {
    return encodePng(pipeline.flatten({ background: '#ffffff' }));
  }
  return encodePng(pipeline);
}

/**
 * Normalize AI preview output to a solid #FFFFFF backdrop.
 */
export async function ensureWhiteProductPng(buffer: Buffer): Promise<Buffer> {
  return stripExteriorBackdrop(buffer, 'white');
}

/** Encode AI transparent cutout as PNG; strip baked checkerboard/grey backdrops to alpha. */
export async function finalizeTransparentProductPng(buffer: Buffer): Promise<Buffer> {
  return stripExteriorBackdrop(buffer, 'transparent');
}

/** Keep API preview payloads under Lambda's 6MB response limit. */
export async function compressImageForApiPreview(buffer: Buffer, maxDimension = 1024): Promise<Buffer> {
  return sharp(buffer)
    .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

/** @deprecated Use compressImageForApiPreview */
export async function compressPngForApiPreview(buffer: Buffer, maxDimension = 1024): Promise<Buffer> {
  return compressImageForApiPreview(buffer, maxDimension);
}
