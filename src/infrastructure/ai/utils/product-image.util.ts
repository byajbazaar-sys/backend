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

function markConnectedBackdrop(
  data: Buffer,
  width: number,
  height: number,
  seeds: Uint8Array,
  matches: (r: number, g: number, b: number) => boolean,
): Uint8Array {
  const marked = new Uint8Array(width * height);
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
    marked[i] = 1;
    queue.push(i);
  };

  for (let i = 0; i < seeds.length; i++) {
    if (!seeds[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    tryEnqueue(x, y);
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

  return marked;
}

/** AI often paints grey/white checkerboard inside ring holes instead of alpha. */
function markCheckerboardBackdropPixels(data: Buffer, width: number, height: number): Uint8Array {
  const marked = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      if (!isBackdropCandidate(r, g, b)) continue;

      const centerLuma = (r + g + b) / 3;
      let contrastingBackdropNeighbor = false;

      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const no = (ny * width + nx) * 4;
        const nr = data[no];
        const ng = data[no + 1];
        const nb = data[no + 2];
        if (!isBackdropCandidate(nr, ng, nb)) continue;
        const neighborLuma = (nr + ng + nb) / 3;
        if (Math.abs(neighborLuma - centerLuma) >= 12) {
          contrastingBackdropNeighbor = true;
          break;
        }
      }

      if (contrastingBackdropNeighbor) {
        marked[y * width + x] = 1;
      }
    }
  }

  return marked;
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

  if (mode === 'white') {
    const meta = await sharp(buffer).metadata();
    if (meta.hasAlpha) {
      const sample = await sharp(buffer)
        .rotate()
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (bordersMostlyTransparent(sample.data, sample.info.width, sample.info.height)) {
        return encodePng(
          sharp(buffer)
            .rotate()
            .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
            .flatten({ background: '#ffffff' }),
        );
      }
    }
  }

  const { data, info } = await loadProductRaster(buffer);
  const exterior = markExteriorPixels(data, info.width, info.height, isBackdropCandidate);
  const toRemove = new Uint8Array(exterior.length);
  toRemove.set(exterior);

  if (mode === 'transparent') {
    const checkerSeeds = markCheckerboardBackdropPixels(data, info.width, info.height);
    const checkerBackdrop = markConnectedBackdrop(
      data,
      info.width,
      info.height,
      checkerSeeds,
      isBackdropCandidate,
    );
    for (let i = 0; i < toRemove.length; i++) {
      if (checkerBackdrop[i]) toRemove[i] = 1;
    }
  }

  for (let i = 0; i < toRemove.length; i++) {
    if (!toRemove[i]) continue;
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
