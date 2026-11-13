/**
 * Raster primitives for product cutouts.
 *
 * Every function is pure and synchronous and works on raw row-major buffers:
 * RGB images hold 3 interleaved channels, masks hold 0/1 per pixel and scalar maps are Float32.
 */

export type Rgb = [number, number, number];

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

export function whiteDistance(r: number, g: number, b: number): number {
  return colorDistance(r, g, b, 255, 255, 255);
}

// ---------------------------------------------------------------------------
// Box filters and morphology
// ---------------------------------------------------------------------------

/** Sum over a (2r+1)² window, truncated at the image edges. O(N) regardless of radius. */
export function boxSum(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let acc = 0;
    for (let x = 0; x <= Math.min(radius, width - 1); x++) acc += src[row + x];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = acc;
      const add = x + radius + 1;
      if (add < width) acc += src[row + add];
      const sub = x - radius;
      if (sub >= 0) acc -= src[row + sub];
    }
  }

  const acc = new Float64Array(width);
  for (let y = 0; y <= Math.min(radius, height - 1); y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) acc[x] += tmp[row + x];
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) out[row + x] = acc[x];
    const add = y + radius + 1;
    if (add < height) {
      const addRow = add * width;
      for (let x = 0; x < width; x++) acc[x] += tmp[addRow + x];
    }
    const sub = y - radius;
    if (sub >= 0) {
      const subRow = sub * width;
      for (let x = 0; x < width; x++) acc[x] -= tmp[subRow + x];
    }
  }

  return out;
}

/** Mean over a (2r+1)² window, truncated at the image edges. */
export function boxMean(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const out = boxSum(src, width, height, radius);
  for (let y = 0; y < height; y++) {
    const rows = Math.min(y + radius, height - 1) - Math.max(y - radius, 0) + 1;
    for (let x = 0; x < width; x++) {
      const cols = Math.min(x + radius, width - 1) - Math.max(x - radius, 0) + 1;
      out[y * width + x] /= rows * cols;
    }
  }
  return out;
}

export function maskToFloat(mask: Uint8Array): Float32Array {
  const out = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i];
  return out;
}

export function invertMask(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}

export function countMask(mask: Uint8Array): number {
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/prefer-for-of -- indexed access is much faster on typed arrays
  for (let i = 0; i < mask.length; i++) count += mask[i];
  return count;
}

/** Binary dilation with a (2r+1)² square. */
export function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();
  const sums = boxSum(maskToFloat(mask), width, height, radius);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = sums[i] > 0.5 ? 1 : 0;
  return out;
}

/** Binary erosion with a (2r+1)² square; pixels outside the image do not erode the mask. */
export function erode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();
  const sums = boxSum(maskToFloat(mask), width, height, radius);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const rows = Math.min(y + radius, height - 1) - Math.max(y - radius, 0) + 1;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const cols = Math.min(x + radius, width - 1) - Math.max(x - radius, 0) + 1;
      out[i] = sums[i] > rows * cols - 0.5 ? 1 : 0;
    }
  }
  return out;
}

/** Inclusive pixel rectangle. */
export interface PixelRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Bounding box of `pixels` grown by `margin`, clipped to the image. */
export function regionAround(pixels: Int32Array, width: number, height: number, margin: number): PixelRegion {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (const i of pixels) {
    const x = i % width;
    const y = (i - x) / width;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return {
    x0: Math.max(0, x0 - margin),
    y0: Math.max(0, y0 - margin),
    x1: Math.min(width - 1, x1 + margin),
    y1: Math.min(height - 1, y1 + margin),
  };
}

/**
 * Window sums of `weight[i] * value(i)` over (2r+1)² windows centred on the pixels in `at`, via a summed-area table
 * built over `region` only (it must contain every window, e.g. `regionAround(at, …, r)`).
 * `value(i)` is `rgb[i * 3 + channel]` when `rgb` is given, else 1 (plain weighted counts). Pass `table` to reuse memory.
 */
export function windowSumsAt(
  rgb: Uint8Array | null,
  channel: number,
  weight: Uint8Array | Float32Array,
  width: number,
  height: number,
  radius: number,
  at: Int32Array,
  region: PixelRegion = { x0: 0, y0: 0, x1: width - 1, y1: height - 1 },
  table?: Float64Array,
): Float32Array {
  const rw = region.x1 - region.x0 + 1;
  const rh = region.y1 - region.y0 + 1;
  const stride = rw + 1;
  const sat = table && table.length >= stride * (rh + 1) ? table : new Float64Array(stride * (rh + 1));
  for (let ry = 0; ry < rh; ry++) {
    const src = (region.y0 + ry) * width + region.x0;
    const prev = ry * stride + 1;
    const dst = prev + stride;
    let rowSum = 0;
    if (rgb) {
      for (let rx = 0; rx < rw; rx++) {
        rowSum += weight[src + rx] * rgb[(src + rx) * 3 + channel];
        sat[dst + rx] = sat[prev + rx] + rowSum;
      }
    } else {
      for (let rx = 0; rx < rw; rx++) {
        rowSum += weight[src + rx];
        sat[dst + rx] = sat[prev + rx] + rowSum;
      }
    }
  }

  const out = new Float32Array(at.length);
  for (let k = 0; k < at.length; k++) {
    const i = at[k];
    const x = i % width;
    const y = (i - x) / width;
    const x0 = Math.max(region.x0, x - radius) - region.x0;
    const x1 = Math.min(region.x1, x + radius) - region.x0 + 1;
    const y0 = (Math.max(region.y0, y - radius) - region.y0) * stride;
    const y1 = (Math.min(region.y1, y + radius) - region.y0 + 1) * stride;
    out[k] = sat[y1 + x1] - sat[y0 + x1] - sat[y1 + x0] + sat[y0 + x0];
  }
  return out;
}

/** One colour channel of an interleaved RGB buffer as floats. */
export function channelPlane(rgb: Uint8Array, channel: number): Float32Array {
  const out = new Float32Array(rgb.length / 3);
  for (let i = 0, o = channel; i < out.length; i++, o += 3) out[i] = rgb[o];
  return out;
}

/** Local standard deviation of luma over a (2r+1)² window. */
export function localLumaStd(rgb: Uint8Array, width: number, height: number, radius: number): Float32Array {
  const n = width * height;
  const values = new Float32Array(n);
  const squares = new Float32Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    const v = luma(rgb[o], rgb[o + 1], rgb[o + 2]);
    values[i] = v;
    squares[i] = v * v;
  }
  const mean = boxMean(values, width, height, radius);
  const meanSq = boxMean(squares, width, height, radius);
  for (let i = 0; i < n; i++) mean[i] = Math.sqrt(Math.max(0, meanSq[i] - mean[i] * mean[i]));
  return mean;
}

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

/** Pixels reachable from the image border through `passable` pixels (4-connected). */
export function floodFromBorder(passable: Uint8Array, width: number, height: number): Uint8Array {
  const reached = new Uint8Array(passable.length);
  const queue = new Int32Array(passable.length);
  let tail = 0;

  const visit = (i: number): void => {
    if (passable[i] && !reached[i]) {
      reached[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }

  const last = passable.length - width;
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    const x = i % width;
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i < last) visit(i + width);
  }

  return reached;
}

/**
 * 1 where `level` differs from every 8-neighbour by at most `maxStep`.
 * Soft shadows and flat backdrop pass; any edge (even anti-aliased) fails, whatever direction it is approached from.
 */
export function smoothMask(level: Float32Array, width: number, height: number, maxStep: number): Uint8Array {
  const out = new Uint8Array(level.length);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(width - 1, x + 1);
      const v = level[y * width + x];
      let smooth = 1;
      for (let ny = y0; ny <= y1 && smooth; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          if (Math.abs(level[ny * width + nx] - v) > maxStep) {
            smooth = 0;
            break;
          }
        }
      }
      out[y * width + x] = smooth;
    }
  }
  return out;
}

export interface PixelComponent {
  /** Offset of this component's first pixel in `ComponentLabels.pixels`. */
  start: number;
  size: number;
  touchesBorder: boolean;
}

export interface ComponentLabels {
  components: PixelComponent[];
  /** Pixel indices grouped by component. */
  pixels: Int32Array;
}

/** 4-connected components of a binary mask. */
export function labelComponents(mask: Uint8Array, width: number, height: number): ComponentLabels {
  const visited = new Uint8Array(mask.length);
  const pixels = new Int32Array(countMask(mask));
  const components: PixelComponent[] = [];
  const last = (height - 1) * width;
  let tail = 0;

  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || visited[seed]) continue;
    const start = tail;
    let touchesBorder = false;
    visited[seed] = 1;
    pixels[tail++] = seed;

    for (let head = start; head < tail; head++) {
      const i = pixels[head];
      const x = i % width;
      if (x === 0 || x === width - 1 || i < width || i >= last) touchesBorder = true;
      if (x > 0 && mask[i - 1] && !visited[i - 1]) {
        visited[i - 1] = 1;
        pixels[tail++] = i - 1;
      }
      if (x < width - 1 && mask[i + 1] && !visited[i + 1]) {
        visited[i + 1] = 1;
        pixels[tail++] = i + 1;
      }
      if (i >= width && mask[i - width] && !visited[i - width]) {
        visited[i - width] = 1;
        pixels[tail++] = i - width;
      }
      if (i < last && mask[i + width] && !visited[i + width]) {
        visited[i + width] = 1;
        pixels[tail++] = i + width;
      }
    }

    components.push({ start, size: tail - start, touchesBorder });
  }

  return { components, pixels };
}

// ---------------------------------------------------------------------------
// Backdrop statistics
// ---------------------------------------------------------------------------

export interface BackdropEstimate {
  /** Median colour of the image border. */
  color: Rgb;
  luma: number;
  /** Max colour distance from `color` that still reads as backdrop. */
  tolerance: number;
}

function forEachBorderPixel(width: number, height: number, ring: number, fn: (i: number) => void): void {
  const r = Math.max(1, Math.min(ring, Math.floor(width / 2), Math.floor(height / 2)));
  for (let y = 0; y < height; y++) {
    const row = y * width;
    if (y < r || y >= height - r) {
      for (let x = 0; x < width; x++) fn(row + x);
    } else {
      for (let x = 0; x < r; x++) fn(row + x);
      for (let x = Math.max(r, width - r); x < width; x++) fn(row + x);
    }
  }
}

export function histogramQuantile(hist: Uint32Array, total: number, q: number): number {
  const target = q * total;
  let acc = 0;
  for (let v = 0; v < hist.length; v++) {
    acc += hist[v];
    if (acc >= target) return v;
  }
  return hist.length - 1;
}

/** Robust backdrop colour from the image border (median + spread). */
export function estimateBackdrop(rgb: Uint8Array, width: number, height: number, ring = 2): BackdropEstimate {
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let total = 0;
  forEachBorderPixel(width, height, ring, (i) => {
    const o = i * 3;
    hist[0][rgb[o]]++;
    hist[1][rgb[o + 1]]++;
    hist[2][rgb[o + 2]]++;
    total++;
  });

  const color: Rgb = [
    histogramQuantile(hist[0], total, 0.5),
    histogramQuantile(hist[1], total, 0.5),
    histogramQuantile(hist[2], total, 0.5),
  ];

  const distances = new Uint32Array(443);
  forEachBorderPixel(width, height, ring, (i) => {
    const o = i * 3;
    distances[Math.round(colorDistance(rgb[o], rgb[o + 1], rgb[o + 2], color[0], color[1], color[2]))]++;
  });
  const spread = histogramQuantile(distances, total, 0.9);

  return {
    color,
    luma: luma(color[0], color[1], color[2]),
    tolerance: clamp(spread + 14, 20, 64),
  };
}

/** Quantile of each pixel's distance from white along the image border. */
export function borderWhiteDistanceQuantile(rgb: Uint8Array, width: number, height: number, q: number): number {
  const hist = new Uint32Array(443);
  let total = 0;
  forEachBorderPixel(width, height, 2, (i) => {
    const o = i * 3;
    hist[Math.round(whiteDistance(rgb[o], rgb[o + 1], rgb[o + 2]))]++;
    total++;
  });
  return histogramQuantile(hist, total, q);
}

/** Mean of `map` along the image border. */
export function borderMean(map: Float32Array, width: number, height: number): number {
  let sum = 0;
  let total = 0;
  forEachBorderPixel(width, height, 2, (i) => {
    sum += map[i];
    total++;
  });
  return total ? sum / total : 0;
}

// ---------------------------------------------------------------------------
// Alignment (scale about the centre + translation)
// ---------------------------------------------------------------------------

/**
 * Maps reference coordinates to moving-image coordinates:
 * x' = cx + (x - cx) * scale + dx * width (dy likewise), so the transform is resolution-independent.
 */
export interface AlignmentTransform {
  scale: number;
  dx: number;
  dy: number;
}

export const IDENTITY_ALIGNMENT: AlignmentTransform = { scale: 1, dx: 0, dy: 0 };

/** |∂x| + |∂y| of a single-channel image (central differences, zero at the border). */
export function gradientMagnitude(gray: Uint8Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      out[i] = Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + width] - gray[i - width]);
    }
  }
  return out;
}

/** Cosine similarity between reference gradients and transformed moving gradients over the overlap. */
export function alignmentScore(
  reference: Float32Array,
  moving: Float32Array,
  width: number,
  height: number,
  t: AlignmentTransform,
  stride = 1,
): number {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const offsetX = t.dx * width;
  const offsetY = t.dy * height;
  let dot = 0;
  let refSq = 0;
  let movSq = 0;

  for (let y = 1; y < height - 1; y += stride) {
    const my = cy + (y - cy) * t.scale + offsetY;
    if (my < 0 || my > height - 1) continue;
    const y0 = Math.min(Math.floor(my), height - 2);
    const fy = my - y0;
    const row0 = y0 * width;
    const row1 = row0 + width;
    for (let x = 1; x < width - 1; x += stride) {
      const mx = cx + (x - cx) * t.scale + offsetX;
      if (mx < 0 || mx > width - 1) continue;
      const x0 = Math.min(Math.floor(mx), width - 2);
      const fx = mx - x0;
      const top = moving[row0 + x0] + (moving[row0 + x0 + 1] - moving[row0 + x0]) * fx;
      const bottom = moving[row1 + x0] + (moving[row1 + x0 + 1] - moving[row1 + x0]) * fx;
      const m = top + (bottom - top) * fy;
      const r = reference[y * width + x];
      dot += r * m;
      refSq += r * r;
      movSq += m * m;
    }
  }

  return refSq > 0 && movSq > 0 ? dot / Math.sqrt(refSq * movSq) : 0;
}

/** Exhaustive search of translations (in pixels at this level) and scales around a starting transform. */
export function searchAlignment(
  reference: Float32Array,
  moving: Float32Array,
  width: number,
  height: number,
  around: AlignmentTransform,
  radiusPx: number,
  stepPx: number,
  scales: number[],
  stride = 1,
): { transform: AlignmentTransform; score: number } {
  let best = { transform: around, score: -1 };
  for (const scale of scales) {
    for (let oy = -radiusPx; oy <= radiusPx + 1e-9; oy += stepPx) {
      for (let ox = -radiusPx; ox <= radiusPx + 1e-9; ox += stepPx) {
        const transform = { scale, dx: around.dx + ox / width, dy: around.dy + oy / height };
        const score = alignmentScore(reference, moving, width, height, transform, stride);
        if (score > best.score) best = { transform, score };
      }
    }
  }
  return best;
}

/** Pattern search (shift ± step px, scale ± step) from `start`, halving steps until below `minStepPx`. */
export function refineAlignment(
  reference: Float32Array,
  moving: Float32Array,
  width: number,
  height: number,
  start: AlignmentTransform,
  stepPx: number,
  stepScale: number,
  minStepPx: number,
  stride = 1,
): { transform: AlignmentTransform; score: number } {
  let best = { transform: start, score: alignmentScore(reference, moving, width, height, start, stride) };
  let px = stepPx;
  let sc = stepScale;
  for (let iteration = 0; iteration < 60 && px >= minStepPx; iteration++) {
    const t = best.transform;
    const candidates: AlignmentTransform[] = [
      { ...t, dx: t.dx + px / width },
      { ...t, dx: t.dx - px / width },
      { ...t, dy: t.dy + px / height },
      { ...t, dy: t.dy - px / height },
      { ...t, scale: t.scale + sc },
      { ...t, scale: t.scale - sc },
    ];
    let improved = false;
    for (const transform of candidates) {
      const score = alignmentScore(reference, moving, width, height, transform, stride);
      if (score > best.score + 1e-6) {
        best = { transform, score };
        improved = true;
      }
    }
    if (!improved) {
      px /= 2;
      sc /= 2;
    }
  }
  return best;
}

/** Resample an RGB image through `t` (bilinear); pixels mapped from outside the source get `fill`. */
export function warpRgb(src: Uint8Array, width: number, height: number, t: AlignmentTransform, fill = 255): Uint8Array {
  const out = new Uint8Array(src.length);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const offsetX = t.dx * width;
  const offsetY = t.dy * height;

  for (let y = 0; y < height; y++) {
    const sy = cy + (y - cy) * t.scale + offsetY;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      const sx = cx + (x - cx) * t.scale + offsetX;
      if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) {
        out[o] = out[o + 1] = out[o + 2] = fill;
        continue;
      }
      const x0 = Math.min(Math.floor(sx), Math.max(0, width - 2));
      const y0 = Math.min(Math.floor(sy), Math.max(0, height - 2));
      const x1 = Math.min(x0 + 1, width - 1);
      const y1 = Math.min(y0 + 1, height - 1);
      const fx = sx - x0;
      const fy = sy - y0;
      for (let c = 0; c < 3; c++) {
        const p00 = src[(y0 * width + x0) * 3 + c];
        const p10 = src[(y0 * width + x1) * 3 + c];
        const p01 = src[(y1 * width + x0) * 3 + c];
        const p11 = src[(y1 * width + x1) * 3 + c];
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        out[o + c] = Math.round(top + (bottom - top) * fy);
      }
    }
  }

  return out;
}
