import sharp from 'sharp';

const WHITE_THRESHOLD = 245;

function isWhitePixel(r: number, g: number, b: number): boolean {
  return r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
}

/** Near-white or neutral light grey — AI checkerboards and leftover studio tones (preview normalize only). */
function isBackdropCandidate(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (isWhitePixel(r, g, b)) return true;
  return max >= 175 && min >= 165 && max - min <= 18;
}

function markExteriorPixels(
  data: Buffer,
  width: number,
  height: number,
  matches: (r: number, g: number, b: number) => boolean,
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
    if (!matches(data[o], data[o + 1], data[o + 2])) return;
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

/** Interior holes (e.g. ring band) where AI baked checkerboard instead of real transparency. */
function markEnclosedCheckerboard(data: Buffer, width: number, height: number): Uint8Array {
  const enclosed = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const idx = (x: number, y: number) => y * width + x;

  const isCandidate = (x: number, y: number) => {
    const o = idx(x, y) * 4;
    return isBackdropCandidate(data[o], data[o + 1], data[o + 2]);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = idx(x, y);
      if (visited[start] || !isCandidate(x, y)) continue;

      const component: number[] = [];
      let touchesBorder = false;
      let hasGrey = false;
      let hasWhite = false;
      const queue = [start];
      visited[start] = 1;

      let head = 0;
      while (head < queue.length) {
        const i = queue[head++];
        component.push(i);
        const px = i % width;
        const py = (i - px) / width;
        if (px === 0 || px === width - 1 || py === 0 || py === height - 1) touchesBorder = true;

        const o = i * 4;
        if (isWhitePixel(data[o], data[o + 1], data[o + 2])) hasWhite = true;
        else hasGrey = true;

        const neighbors = [
          [px - 1, py],
          [px + 1, py],
          [px, py - 1],
          [px, py + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = idx(nx, ny);
          if (visited[ni] || !isCandidate(nx, ny)) continue;
          visited[ni] = 1;
          queue.push(ni);
        }
      }

      if (touchesBorder || !hasGrey || !hasWhite) continue;
      for (const i of component) enclosed[i] = 1;
    }
  }

  return enclosed;
}

function applyBackdropMask(
  data: Buffer,
  mask: Uint8Array,
  mode: 'white' | 'transparent',
): void {
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

async function stripExteriorBackdrop(buffer: Buffer, mode: 'white' | 'transparent'): Promise<Buffer> {
  const encodePng = (pipeline: sharp.Sharp) =>
    pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();

  const meta = await sharp(buffer).metadata();
  if (meta.hasAlpha) {
    const sample = await sharp(buffer)
      .rotate()
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (bordersMostlyTransparent(sample.data, sample.info.width, sample.info.height)) {
      const pipeline = sharp(buffer)
        .rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .ensureAlpha();
      if (mode === 'white') {
        return encodePng(pipeline.flatten({ background: '#ffffff' }));
      }
      return encodePng(pipeline);
    }
  }

  const { data, info } = await loadProductRaster(buffer);
  const exterior = markExteriorPixels(data, info.width, info.height, isBackdropCandidate);
  const enclosedCheckerboard = markEnclosedCheckerboard(data, info.width, info.height);
  applyBackdropMask(data, exterior, mode);
  applyBackdropMask(data, enclosedCheckerboard, mode);

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
