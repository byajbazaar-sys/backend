import sharp from 'sharp';

import {
  type AlignmentTransform,
  type BackdropEstimate,
  type Rgb,
  IDENTITY_ALIGNMENT,
  alignmentScore,
  borderMean,
  borderWhiteDistanceQuantile,
  boxMean,
  boxSum,
  clamp,
  colorDistance,
  countMask,
  dilate,
  erode,
  estimateBackdrop,
  floodFromBorder,
  gradientMagnitude,
  histogramQuantile,
  invertMask,
  labelComponents,
  localLumaStd,
  luma,
  refineAlignment,
  regionAround,
  searchAlignment,
  smoothMask,
  smoothstep,
  warpRgb,
  whiteDistance,
  windowSumsAt,
} from './product-matting.util';

/** Longest side (px) of previewed / stored cutouts. */
const CUTOUT_MAX_PX = 1600;
const WHITE_THRESHOLD = 245;
/** Tightest distance from #FFFFFF treated as backdrop when keying out white on save. */
const WHITE_KEY_TOLERANCE = 7;
/** Upper bound for the adaptive white key (slightly noisy studio backdrops). */
const WHITE_KEY_MAX_TOLERANCE = 18;
/** Distance from #FFFFFF that counts as "pure white" in AI output (JPEG noise included). */
const AI_WHITE_TOLERANCE = 12;
/** Half-width (px) of the edge band whose alpha comes from colour un-mixing instead of the binary mask. */
const EDGE_BAND_RADIUS = 2;
/** Wider band for photographed white backdrops: JPEG ringing around edges reaches a few pixels out. */
const PHOTO_EDGE_BAND_RADIUS = 4;
/** Blurred RGB distance between AI output and original: fully agree below, fully disagree above. */
const AGREE_LOW = 28;
const AGREE_HIGH = 72;
/** Fraction of product pixels that must agree before original pixels are trusted. */
const MIN_AGREEMENT_RATIO = 0.6;
/** Blurred RGB distance at or below which the AI kept a pixel as photographed. */
const PRESERVED_DISTANCE = 32;
/** Foreground share + agreement above which the model is judged to have returned the photo unchanged. */
const UNCHANGED_MIN_FOREGROUND = 0.3;
const UNCHANGED_MIN_AGREEMENT = 0.75;
/** Max luma difference to any neighbour for light grey to count as smooth (shadow) rather than an edge. */
const SMOOTH_STEP = 6;

export interface ProductModelLayout {
  /** Side of the square canvas sent to the model (px). */
  canvas: number;
  /** Placement of the photo inside that canvas (px). */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ProductModelInput {
  buffer: Buffer;
  layout: ProductModelLayout;
}

export interface ProductCutoutStats {
  alignment: AlignmentTransform;
  alignmentApplied: boolean;
  /** Share of product pixels where the AI output matches the original photo. */
  agreement: number;
  /** True when product pixels come from the original photo rather than the AI redraw. */
  originalPixels: boolean;
  holesRemoved: number;
  foregroundRatio: number;
  /** True when the photo's own backdrop is (near) white. */
  whiteBackdrop: boolean;
  /** True when the model handed the photo back with its backdrop still in place. */
  unchangedPhoto: boolean;
  /** True when the model was skipped and the cutout came from keying the photo's own white backdrop. */
  keyedOnly: boolean;
  /** Number of separate opaque pieces (ignoring specks). */
  fragments: number;
  /** Share of near-black pixels in the model's foreground: line-art sketches score ≥ 0.09, photo cutouts ≤ 0.05. */
  darkFraction: number;
}

export interface ProductCutout {
  width: number;
  height: number;
  /** Decontaminated product colours (RGB). */
  rgb: Uint8Array;
  alpha: Uint8Array;
  stats: ProductCutoutStats;
}

export interface RefineOptions {
  /**
   * The white around the product is not the photo's own backdrop (a transparent cutout flattened to white, or a
   * white photo whose white key still left a large prop), so a high-agreement, large-foreground result counts as
   * "the model gave the photo back" rather than as a legitimately white photo.
   */
  whiteIsForeign?: boolean;
}

interface RgbImage {
  data: Uint8Array;
  width: number;
  height: number;
}

interface AlignmentResult {
  transform: AlignmentTransform;
  applied: boolean;
}

// ---------------------------------------------------------------------------
// Pixel classifiers
// ---------------------------------------------------------------------------

function isWhitePixel(r: number, g: number, b: number): boolean {
  return r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
}

/** Studio backdrop only — tight match to #FFFFFF so gems/highlights are not selected. */
function isStrictBackdropWhite(r: number, g: number, b: number): boolean {
  return whiteDistance(r, g, b) <= WHITE_KEY_TOLERANCE;
}

/** Near-white or neutral light grey — AI checkerboards and leftover studio tones. */
function isBackdropCandidate(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (isWhitePixel(r, g, b)) return true;
  return max >= 175 && min >= 165 && max - min <= 18;
}

/** Pixels flat enough to be a shadow rather than a metal edge (white-key path only). */
function shadowGate(data: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height;
  const smooth = smoothMask(lumaPlane(data, n), width, height, SMOOTH_STEP);
  const std = localLumaStd(data, width, height, 2);
  const gate = new Uint8Array(n);
  for (let i = 0; i < n; i++) gate[i] = smooth[i] === 1 && std[i] <= 3 ? 1 : 0;
  return gate;
}

/** White backdrop, plus neutral shadow where {@link shadowGate} allows it. */
function backdropMask(data: Uint8Array, n: number, tolerance: number, gate: Uint8Array): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const shadow = isNeutralShadow(r, g, b) && gate[i] === 1;
    out[i] = whiteDistance(r, g, b) <= tolerance || shadow ? 1 : 0;
  }
  return out;
}

/** Neutral grey from near-white down to a deep contact shadow (white-key path only). */
function isNeutralShadow(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max >= 110 && max - min <= 14;
}

/** Original-photo pixel that looks like its own backdrop (same colour, not brighter — shadows only darken). */
function isOriginalBackdrop(r: number, g: number, b: number, backdrop: BackdropEstimate): boolean {
  const [br, bg, bb] = backdrop.color;
  return colorDistance(r, g, b, br, bg, bb) <= backdrop.tolerance && luma(r, g, b) <= backdrop.luma + 10;
}

function lumaPlane(rgb: Uint8Array, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 3) out[i] = luma(rgb[o], rgb[o + 1], rgb[o + 2]);
  return out;
}

function agreementWeight(distance: number): number {
  return 1 - smoothstep(AGREE_LOW, AGREE_HIGH, distance);
}

// ---------------------------------------------------------------------------
// Decoding helpers
// ---------------------------------------------------------------------------

async function decodeRgb(pipeline: sharp.Sharp): Promise<RgbImage> {
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels === 3) return { data, width, height };

  const out = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const gray = channels < 3;
    out[i * 3] = data[s];
    out[i * 3 + 1] = gray ? data[s] : data[s + 1];
    out[i * 3 + 2] = gray ? data[s] : data[s + 2];
  }
  return { data: out, width, height };
}

async function loadRgb(buffer: Buffer): Promise<RgbImage> {
  return decodeRgb(
    sharp(buffer)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(CUTOUT_MAX_PX, CUTOUT_MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .removeAlpha(),
  );
}

/** Pixel size after applying EXIF orientation. */
async function orientedSize(buffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('Image has no readable dimensions');
  }
  return (meta.orientation ?? 1) >= 5
    ? { width: meta.height, height: meta.width }
    : { width: meta.width, height: meta.height };
}

// ---------------------------------------------------------------------------
// Model input
// ---------------------------------------------------------------------------

/**
 * Downscale the photo for the model and pad it to a square with its own backdrop colour.
 * The model always renders a square, so padding keeps the product's proportions and placement
 * instead of letting the model stretch or re-frame non-square photos.
 */
export async function prepareProductModelInput(original: Buffer, maxPx: number): Promise<ProductModelInput> {
  const { data, width, height } = await decodeRgb(
    sharp(original)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true })
      .removeAlpha(),
  );
  const [r, g, b] = estimateBackdrop(data, width, height).color;
  const canvas = Math.max(width, height);
  const left = Math.floor((canvas - width) / 2);
  const top = Math.floor((canvas - height) / 2);

  const buffer = await sharp(data, { raw: { width, height, channels: 3 } })
    .extend({
      top,
      bottom: canvas - height - top,
      left,
      right: canvas - width - left,
      background: { r, g, b },
    })
    .jpeg({ quality: 95 })
    .toBuffer();

  return { buffer, layout: { canvas, left, top, width, height } };
}

function layoutToOutputRegion(
  layout: ProductModelLayout,
  outWidth: number,
  outHeight: number,
): { left: number; top: number; width: number; height: number } {
  const sx = outWidth / layout.canvas;
  const sy = outHeight / layout.canvas;
  const left = clamp(Math.round(layout.left * sx), 0, outWidth - 1);
  const top = clamp(Math.round(layout.top * sy), 0, outHeight - 1);
  return {
    left,
    top,
    width: clamp(Math.round(layout.width * sx), 1, outWidth - left),
    height: clamp(Math.round(layout.height * sy), 1, outHeight - top),
  };
}

// ---------------------------------------------------------------------------
// AI output → cutout
// ---------------------------------------------------------------------------

/**
 * Turn the model's white-background render into a cutout of the ORIGINAL photo.
 *
 * The AI output is used as a segmentation guide: it is cropped back to the photo's framing, aligned to the
 * original, and compared against it. Where the two agree, the product keeps the original pixels (no redrawn
 * stones, engravings or colour shifts); where the model intentionally changed something (e.g. removed a finger
 * covering the band) the AI pixels are used. Edges get fractional alpha with the backdrop colour un-mixed, so
 * there is no white or coloured halo, and enclosed backdrop (inside rings, between links) is removed.
 */
export async function refineProductCutout(
  original: Buffer,
  aiOutput: Buffer,
  layout: ProductModelLayout,
  options: RefineOptions = {},
): Promise<ProductCutout> {
  const aiSize = await orientedSize(aiOutput);
  const crop = layoutToOutputRegion(layout, aiSize.width, aiSize.height);
  const originalSize = await orientedSize(original);
  const originalLong = Math.max(originalSize.width, originalSize.height);
  const longSide = Math.min(CUTOUT_MAX_PX, Math.max(originalLong, crop.width, crop.height));
  const width = Math.max(1, Math.round((originalSize.width * longSide) / originalLong));
  const height = Math.max(1, Math.round((originalSize.height * longSide) / originalLong));

  const [orig, generated] = await Promise.all([
    decodeRgb(
      sharp(original).rotate().flatten({ background: '#ffffff' }).resize(width, height, { fit: 'fill' }).removeAlpha(),
    ),
    decodeRgb(
      sharp(aiOutput)
        .flatten({ background: '#ffffff' })
        .extract(crop)
        .resize(width, height, { fit: 'fill' })
        .removeAlpha(),
    ),
  ]);

  const alignment = await estimateAlignment(orig.data, generated.data, width, height);
  const aligned = alignment.applied ? warpRgb(generated.data, width, height, alignment.transform) : generated.data;
  return segmentProduct(orig.data, aligned, width, height, alignment, options);
}

async function gradientLevel(
  rgb: Uint8Array,
  width: number,
  height: number,
  levelWidth: number,
  levelHeight: number,
): Promise<Float32Array> {
  const { data, info } = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .resize(levelWidth, levelHeight, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let gray: Uint8Array = data;
  if (info.channels !== 1) {
    gray = new Uint8Array(levelWidth * levelHeight);
    for (let i = 0; i < gray.length; i++) gray[i] = data[i * info.channels];
  }
  return gradientMagnitude(gray, levelWidth, levelHeight);
}

/**
 * Coarse-to-fine search for the scale + shift that best lines up the AI render with the original.
 * Identity is kept unless a transform is clearly better, so a faithful render is never nudged by noise.
 */
async function estimateAlignment(
  reference: Uint8Array,
  moving: Uint8Array,
  width: number,
  height: number,
): Promise<AlignmentResult> {
  if (width < 32 || height < 32) {
    return { transform: IDENTITY_ALIGNMENT, applied: false };
  }

  const level = async (longSide: number): Promise<{ ref: Float32Array; mov: Float32Array; w: number; h: number }> => {
    const ratio = Math.min(1, longSide / Math.max(width, height));
    const w = Math.max(16, Math.round(width * ratio));
    const h = Math.max(16, Math.round(height * ratio));
    const [ref, mov] = await Promise.all([
      gradientLevel(reference, width, height, w, h),
      gradientLevel(moving, width, height, w, h),
    ]);
    return { ref, mov, w, h };
  };

  const coarse = await level(64);
  const coarseRadius = Math.max(2, Math.round(Math.max(coarse.w, coarse.h) * 0.06));
  const coarseBest = searchAlignment(
    coarse.ref,
    coarse.mov,
    coarse.w,
    coarse.h,
    IDENTITY_ALIGNMENT,
    coarseRadius,
    1,
    [0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06],
  );

  const mid = await level(192);
  const s = coarseBest.transform.scale;
  const midBest = searchAlignment(mid.ref, mid.mov, mid.w, mid.h, coarseBest.transform, 3, 1, [s - 0.01, s, s + 0.01]);

  // The fine level samples every other row/column: plenty of signal at a quarter of the cost.
  const fine = await level(768);
  const fineBest = refineAlignment(fine.ref, fine.mov, fine.w, fine.h, midBest.transform, 2, 0.005, 0.25, 2);
  const identityScore = alignmentScore(fine.ref, fine.mov, fine.w, fine.h, IDENTITY_ALIGNMENT, 2);

  const t = fineBest.transform;
  const moved = Math.abs(t.scale - 1) > 1e-3 || Math.abs(t.dx * width) >= 0.5 || Math.abs(t.dy * height) >= 0.5;
  if (!moved || fineBest.score < identityScore + 0.01) {
    return { transform: IDENTITY_ALIGNMENT, applied: false };
  }
  return { transform: t, applied: true };
}

interface Agreement {
  /** Blurred RGB distance between original and (offset-corrected) AI output, per pixel. */
  distance: Float32Array;
  /** Global colour offset original − AI output, measured on the product. */
  offset: Rgb;
  ratio: number;
  trusted: boolean;
}

function measureAgreement(
  orig: Uint8Array,
  generated: Uint8Array,
  exterior: Uint8Array,
  width: number,
  height: number,
): Agreement {
  const n = width * height;
  const core = erode(invertMask(exterior), width, height, 2);
  const isSample = (i: number): boolean => {
    const o = i * 3;
    return core[i] === 1 && whiteDistance(generated[o], generated[o + 1], generated[o + 2]) > 30;
  };

  // Robust global colour offset (the model may shift white balance slightly).
  const hist = [new Uint32Array(511), new Uint32Array(511), new Uint32Array(511)];
  let samples = 0;
  for (let i = 0; i < n; i++) {
    if (!isSample(i)) continue;
    const o = i * 3;
    for (let c = 0; c < 3; c++) hist[c][orig[o + c] - generated[o + c] + 255]++;
    samples++;
  }
  const offset: Rgb = [0, 0, 0];
  if (samples >= 200) {
    for (let c = 0; c < 3; c++) offset[c] = clamp(histogramQuantile(hist[c], samples, 0.5) - 255, -40, 40);
  }

  // Compare blurred colours so resampling and fine-texture differences do not count as disagreement
  // (blur is linear, so blurring the per-channel difference equals differencing the blurred images).
  const distance = new Float32Array(n);
  const diff = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0, o = c; i < n; i++, o += 3) diff[i] = orig[o] - generated[o] - offset[c];
    const blurred = boxMean(diff, width, height, 2);
    for (let i = 0; i < n; i++) distance[i] += blurred[i] * blurred[i];
  }
  for (let i = 0; i < n; i++) distance[i] = Math.sqrt(distance[i]);

  let agree = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (!isSample(i)) continue;
    total++;
    if (distance[i] <= (AGREE_LOW + AGREE_HIGH) / 2) agree++;
  }
  const ratio = total ? agree / total : 0;

  return {
    distance,
    offset,
    ratio,
    trusted: total >= Math.max(200, n * 0.0005) && ratio >= MIN_AGREEMENT_RATIO,
  };
}

/**
 * Original pixels that the AI preserved and that cannot be backdrop or its shadow:
 * brighter than the backdrop (white stones), a different hue (gold, coloured stones), or textured (metal detail).
 */
function protectOriginalProduct(
  orig: Uint8Array,
  distance: Float32Array,
  backdrop: BackdropEstimate,
  lumaStd: Float32Array,
): Uint8Array {
  const n = distance.length;
  const out = new Uint8Array(n);
  const [br, bg, bb] = backdrop.color;
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    if (distance[i] > PRESERVED_DISTANCE) continue;
    const r = orig[o];
    const g = orig[o + 1];
    const b = orig[o + 2];
    if (colorDistance(r, g, b, br, bg, bb) <= backdrop.tolerance) continue;
    const brighter = luma(r, g, b) > backdrop.luma + 10;
    const otherHue = Math.abs(r - g - (br - bg)) + Math.abs(b - g - (bb - bg)) > 18;
    const textured = lumaStd[i] > 7;
    if (brighter || otherHue || textured) out[i] = 1;
  }
  return out;
}

/**
 * Backdrop-looking regions the flood did not reach — inside rings, between chain links, or AI leftovers such as
 * checkerboard tiles — removed when the AI replaced them or they match the photo's backdrop.
 */
function removeEnclosedBackdrop(
  background: Uint8Array,
  candidate: Uint8Array,
  preserved: Uint8Array,
  strictWhite: Uint8Array,
  protectedMask: Uint8Array,
  distance: Float32Array,
  orig: Uint8Array,
  backdrop: BackdropEstimate,
  lumaStd: Float32Array,
  width: number,
  height: number,
): number {
  const n = width * height;
  const enclosed = new Uint8Array(n);
  // Light grey the AI kept as photographed (silver) never seeds a hole.
  for (let i = 0; i < n; i++) enclosed[i] = candidate[i] && !background[i] && !preserved[i] ? 1 : 0;

  const { components, pixels } = labelComponents(enclosed, width, height);
  const minSize = Math.max(16, Math.round(n * 0.0001));
  const backdropStd = borderMean(lumaStd, width, height);
  let removed = 0;

  for (const component of components) {
    if (component.size < minSize) continue;
    const end = component.start + component.size;
    let protectedCount = 0;
    let weight = 0;
    let white = 0;
    let backdropLike = 0;
    let std = 0;
    let interior = 0;
    for (let k = component.start; k < end; k++) {
      const i = pixels[k];
      const o = i * 3;
      const x = i % width;
      if (x > 0 && x < width - 1 && enclosed[i - 1] && enclosed[i + 1] && enclosed[i - width] && enclosed[i + width]) {
        interior++;
      }
      protectedCount += protectedMask[i];
      weight += agreementWeight(distance[i]);
      white += strictWhite[i];
      backdropLike += isOriginalBackdrop(orig[o], orig[o + 1], orig[o + 2], backdrop) ? 1 : 0;
      std += lumaStd[i];
    }

    const size = component.size;
    // Thin rims hugging the product are edge pixels (handled by matting), not openings.
    if (interior / size < 0.5) continue;
    const replacedByAi = weight / size < 0.35;
    // Border-touching leftovers (e.g. a checkerboard the flood could not cross) only go when the AI clearly made them.
    const matchesBackdrop =
      !component.touchesBorder && white / size >= 0.9 && backdropLike / size >= 0.85 && std / size <= backdropStd + 3;
    if (protectedCount / size < 0.15 && (replacedByAi || matchesBackdrop)) {
      for (let k = component.start; k < end; k++) background[pixels[k]] = 1;
      removed++;
    }
  }

  return removed;
}

/** Large, perfectly flat white regions enclosed by the product — only used when there is no original to compare against. */
function removeFlatWhiteHoles(
  background: Uint8Array,
  rgb: Uint8Array,
  width: number,
  height: number,
  tolerance: number,
  maxStd: number,
  options: { includeShadows?: boolean } = {},
): number {
  const n = width * height;
  const candidate = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    if (background[i]) continue;
    const backdropLike =
      whiteDistance(rgb[o], rgb[o + 1], rgb[o + 2]) <= tolerance ||
      (!!options.includeShadows && isNeutralShadow(rgb[o], rgb[o + 1], rgb[o + 2]));
    candidate[i] = backdropLike ? 1 : 0;
  }

  const { components, pixels } = labelComponents(candidate, width, height);
  // Enclosed shadow pools are far smaller than the product, so a low floor is safe once flatness is required.
  const minSize = Math.max(64, Math.round(n * (options.includeShadows ? 0.0003 : 0.003)));
  let std: Float32Array | undefined;
  let removed = 0;

  for (const component of components) {
    if (component.touchesBorder || component.size < minSize) continue;
    std ??= localLumaStd(rgb, width, height, 2);
    const end = component.start + component.size;
    let flat = 0;
    for (let k = component.start; k < end; k++) if (std[pixels[k]] <= maxStd) flat++;
    if (flat / component.size >= 0.95) {
      for (let k = component.start; k < end; k++) background[pixels[k]] = 1;
      removed++;
    }
  }

  return removed;
}

/** Drop specks of foreground too small to be jewellery (JPEG noise, dust). */
function removeSpeckles(background: Uint8Array, width: number, height: number): void {
  const { components, pixels } = labelComponents(invertMask(background), width, height);
  const minSize = Math.max(4, Math.round(width * height * 0.00001));
  for (const component of components) {
    if (component.size >= minSize) continue;
    for (let k = component.start; k < component.start + component.size; k++) background[pixels[k]] = 1;
  }
}

/** Segment the product from an AI render already aligned to the original, then matte its edges. */
function segmentProduct(
  orig: Uint8Array,
  generated: Uint8Array,
  width: number,
  height: number,
  alignment: AlignmentResult = { transform: IDENTITY_ALIGNMENT, applied: false },
  options: RefineOptions = {},
): ProductCutout {
  const n = width * height;
  const candidate = new Uint8Array(n);
  const strictWhite = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    const r = generated[o];
    const g = generated[o + 1];
    const b = generated[o + 2];
    candidate[i] = isBackdropCandidate(r, g, b) ? 1 : 0;
    strictWhite[i] = whiteDistance(r, g, b) <= AI_WHITE_TOLERANCE ? 1 : 0;
  }

  const exterior = floodFromBorder(candidate, width, height);
  const backdrop = estimateBackdrop(orig, width, height);
  const agreement = measureAgreement(orig, generated, exterior, width, height);

  let background = exterior;
  let holesRemoved: number;
  if (agreement.trusted) {
    const lumaStd = localLumaStd(orig, width, height, 2);
    const protectedMask = protectOriginalProduct(orig, agreement.distance, backdrop, lumaStd);
    const passable = new Uint8Array(n);
    // Light grey (not pure white) may be silver/platinum or a leftover shadow: the flood only crosses it where it
    // is smooth (shadows fade gently into white; metal has a crisp, anti-aliased outline that blocks the flood).
    const smooth = smoothMask(lumaPlane(generated, n), width, height, SMOOTH_STEP);
    // Light grey the AI kept exactly as photographed — product, never a hole seed.
    const preserved = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const lightGrey = candidate[i] && !strictWhite[i];
      passable[i] = candidate[i] && !protectedMask[i] && (strictWhite[i] || smooth[i]) ? 1 : 0;
      preserved[i] = lightGrey && agreement.distance[i] <= PRESERVED_DISTANCE ? 1 : 0;
    }
    background = floodFromBorder(passable, width, height);
    holesRemoved = removeEnclosedBackdrop(
      background,
      candidate,
      preserved,
      strictWhite,
      protectedMask,
      agreement.distance,
      orig,
      backdrop,
      lumaStd,
      width,
      height,
    );
  } else {
    holesRemoved = removeFlatWhiteHoles(background, generated, width, height, AI_WHITE_TOLERANCE, 2);
  }
  removeSpeckles(background, width, height);

  const foregroundRatio = 1 - countMask(background) / n;
  if (foregroundRatio < 0.0005) {
    throw new Error('AI output did not contain a recognisable product');
  }
  const whiteBackdrop = whiteDistance(backdrop.color[0], backdrop.color[1], backdrop.color[2]) <= 24;
  // A large foreground that matches the photo closely means the model kept the pouch / card / stand. A photo on a
  // white backdrop legitimately matches, unless the "backdrop" is just the transparency of an earlier cutout.
  const unchangedPhoto =
    (!whiteBackdrop || !!options.whiteIsForeign) &&
    foregroundRatio > UNCHANGED_MIN_FOREGROUND &&
    agreement.ratio > UNCHANGED_MIN_AGREEMENT;

  let originalWeight: Float32Array | undefined;
  if (agreement.trusted) {
    const weight = new Float32Array(n);
    for (let i = 0, o = 0; i < n; i++, o += 3) {
      // Gaps the AI turned white but that show plain backdrop in the photo stay white, not backdrop-coloured.
      weight[i] =
        strictWhite[i] && isOriginalBackdrop(orig[o], orig[o + 1], orig[o + 2], backdrop)
          ? 0
          : agreementWeight(agreement.distance[i]);
    }
    originalWeight = boxMean(weight, width, height, 2);
  }

  const matte = composeMatte({
    width,
    height,
    background,
    generated,
    generatedOffset: agreement.trusted ? agreement.offset : undefined,
    original: agreement.trusted ? orig : undefined,
    originalWeight,
    originalBackdrop: backdrop.color,
  });

  return {
    width,
    height,
    rgb: matte.rgb,
    alpha: matte.alpha,
    stats: {
      alignment: {
        scale: Math.round(alignment.transform.scale * 10000) / 10000,
        dx: Math.round(alignment.transform.dx * 10000) / 10000,
        dy: Math.round(alignment.transform.dy * 10000) / 10000,
      },
      alignmentApplied: alignment.applied,
      agreement: Math.round(agreement.ratio * 1000) / 1000,
      originalPixels: agreement.trusted,
      holesRemoved,
      foregroundRatio: Math.round(foregroundRatio * 1000) / 1000,
      whiteBackdrop,
      unchangedPhoto,
      keyedOnly: false,
      fragments: countFragments(invertMask(background), width, height),
      darkFraction: Math.round(darkFraction(generated, background) * 1000) / 1000,
    },
  };
}

/** Share of foreground pixels (not strict white) that are near black. */
function darkFraction(rgb: Uint8Array, background: Uint8Array): number {
  let dark = 0;
  let total = 0;
  for (let i = 0, o = 0; i < background.length; i++, o += 3) {
    if (background[i] || whiteDistance(rgb[o], rgb[o + 1], rgb[o + 2]) <= AI_WHITE_TOLERANCE) continue;
    total++;
    if (luma(rgb[o], rgb[o + 1], rgb[o + 2]) < 70) dark++;
  }
  return total ? dark / total : 0;
}

/** Separate pieces of a foreground mask, ignoring specks. */
function countFragments(foreground: Uint8Array, width: number, height: number): number {
  const minSize = Math.max(16, Math.round(width * height * 0.0001));
  return labelComponents(foreground, width, height).components.filter((c) => c.size >= minSize).length;
}

function alphaMask(alpha: Uint8Array): Uint8Array {
  const out = new Uint8Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) out[i] = alpha[i] >= 128 ? 1 : 0;
  return out;
}

// ---------------------------------------------------------------------------
// Edge matting
// ---------------------------------------------------------------------------

interface MatteInput {
  width: number;
  height: number;
  /** Binary backdrop mask (1 = backdrop). */
  background: Uint8Array;
  /** Image whose backdrop is white: the AI render, or a white-backdrop photo. */
  generated: Uint8Array;
  /** Added to `generated` colours so they match the original's colour balance. */
  generatedOffset?: Rgb;
  /** Faithful pixels, blended in per pixel by `originalWeight`. */
  original?: Uint8Array;
  originalWeight?: Float32Array;
  /** Fallback backdrop colour of `original` where no backdrop pixel is nearby. */
  originalBackdrop?: Rgb;
  /** Half-width of the edge band (default {@link EDGE_BAND_RADIUS}). */
  edgeRadius?: number;
}

interface LocalColours {
  fg: Float32Array[];
  bg: Float32Array[];
}

interface EdgeSample {
  pixel: Rgb;
  fg: Rgb;
  bg: Rgb;
  hasFg: boolean;
}

function edgeSample(
  src: Uint8Array,
  i: number,
  local: LocalColours,
  j: number,
  fgCount: number,
  bgCount: number,
  fallbackBg: Rgb,
): EdgeSample {
  const o = i * 3;
  const pixel: Rgb = [src[o], src[o + 1], src[o + 2]];
  const hasFg = fgCount > 0;
  const fg: Rgb = hasFg
    ? [local.fg[0][j] / fgCount, local.fg[1][j] / fgCount, local.fg[2][j] / fgCount]
    : [pixel[0], pixel[1], pixel[2]];
  const bg: Rgb =
    bgCount > 0 ? [local.bg[0][j] / bgCount, local.bg[1][j] / bgCount, local.bg[2][j] / bgCount] : fallbackBg;
  return { pixel, fg, bg, hasFg };
}

/** Alpha from projecting the pixel onto the line between local backdrop and local product colour. */
function projectAlpha(s: EdgeSample, fallback: number, isForeground: boolean): number {
  const contrastToBg = colorDistance(s.pixel[0], s.pixel[1], s.pixel[2], s.bg[0], s.bg[1], s.bg[2]);
  if (!s.hasFg) {
    // Hairline structure (no solid product pixel nearby): opaque where it stands out from the backdrop.
    const contrast = smoothstep(8, 40, contrastToBg);
    return (isForeground ? Math.max(fallback, contrast) : fallback) * contrast;
  }
  const vr = s.fg[0] - s.bg[0];
  const vg = s.fg[1] - s.bg[1];
  const vb = s.fg[2] - s.bg[2];
  const len2 = vr * vr + vg * vg + vb * vb;
  if (len2 < 1) return fallback;
  const projected = clamp(
    ((s.pixel[0] - s.bg[0]) * vr + (s.pixel[1] - s.bg[1]) * vg + (s.pixel[2] - s.bg[2]) * vb) / len2,
    0,
    1,
  );
  // Product and backdrop of similar colour make the projection unreliable — lean on the mask instead.
  const confidence = smoothstep(16, 48, Math.sqrt(len2));
  return confidence * projected + (1 - confidence) * fallback;
}

/** Recover the product colour of a mixed edge pixel: (I − (1 − α)·B) / α, eased toward the local product colour. */
function unmixColour(s: EdgeSample, alpha: number): Rgb {
  if (alpha < 0.02) return s.fg;
  const k = smoothstep(0.1, 0.5, alpha);
  const out: Rgb = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const raw = clamp((s.pixel[c] - (1 - alpha) * s.bg[c]) / alpha, 0, 255);
    out[c] = s.fg[c] + k * (raw - s.fg[c]);
  }
  return out;
}

function composeMatte(input: MatteInput): { rgb: Uint8Array; alpha: Uint8Array } {
  const { width, height, background, generated, original, originalWeight } = input;
  const n = width * height;
  const offset = input.generatedOffset ?? [0, 0, 0];
  const useOriginal = !!original && !!originalWeight;
  const white: Rgb = [255, 255, 255];

  const foreground = invertMask(background);
  const edgeRadius = input.edgeRadius ?? EDGE_BAND_RADIUS;
  // Local colours are sampled just inside the band and averaged over a window reaching past it.
  const sampleRadius = edgeRadius + 4;
  const definiteFg = erode(foreground, width, height, edgeRadius);
  const definiteBg = erode(background, width, height, edgeRadius);
  const sampleFg = erode(foreground, width, height, edgeRadius - 1);
  const sampleBg = erode(background, width, height, edgeRadius - 1);

  const rgb = new Uint8Array(n * 3).fill(255);
  const alpha = new Uint8Array(n);
  const generatedColour = (o: number, c: number): number => clamp(generated[o + c] + offset[c], 0, 255);

  let bandCount = 0;
  for (let i = 0; i < n; i++) if (!definiteFg[i] && !definiteBg[i]) bandCount++;
  const band = new Int32Array(bandCount);

  for (let i = 0, j = 0; i < n; i++) {
    if (definiteFg[i]) {
      const o = i * 3;
      const w = useOriginal ? originalWeight[i] : 0;
      alpha[i] = 255;
      for (let c = 0; c < 3; c++) {
        rgb[o + c] = Math.round(w * (useOriginal ? original[o + c] : 0) + (1 - w) * generatedColour(o, c));
      }
    } else if (!definiteBg[i]) {
      band[j++] = i;
    }
  }
  if (!bandCount) return { rgb, alpha };

  // Everything below is only needed on the band: window sums come from summed-area tables, evaluated there only.
  const region = regionAround(band, width, height, sampleRadius);
  const table = new Float64Array((region.x1 - region.x0 + 2) * (region.y1 - region.y0 + 2));
  const sums = (
    src: Uint8Array | null,
    channel: number,
    weight: Uint8Array | Float32Array,
    radius: number,
  ): Float32Array => windowSumsAt(src, channel, weight, width, height, radius, band, region, table);
  const windowMean = (mask: Uint8Array): Float32Array => {
    const out = sums(null, 0, mask, 1);
    for (let j = 0; j < bandCount; j++) {
      const x = band[j] % width;
      const y = (band[j] - x) / width;
      out[j] /=
        (Math.min(x + 1, width - 1) - Math.max(x - 1, 0) + 1) * (Math.min(y + 1, height - 1) - Math.max(y - 1, 0) + 1);
    }
    return out;
  };
  // Alpha may refine the mask edge by a pixel or two either way, never more.
  const floor = windowMean(definiteFg);
  const ceiling = windowMean(dilate(foreground, width, height, 1));
  const soft = windowMean(foreground);

  const fgCount = sums(null, 0, sampleFg, sampleRadius);
  const bgCount = sums(null, 0, sampleBg, sampleRadius);
  const localColours = (src: Uint8Array): LocalColours => ({
    fg: [0, 1, 2].map((c) => sums(src, c, sampleFg, sampleRadius)),
    bg: [0, 1, 2].map((c) => sums(src, c, sampleBg, sampleRadius)),
  });

  const generatedLocal = localColours(generated);
  const originalLocal = useOriginal ? localColours(original) : undefined;
  let edgeWeight: Float32Array | undefined;
  if (useOriginal) {
    // Use the weight of nearby solid product pixels: the edge pixels themselves differ just because the backdrops differ.
    const weighted = new Float32Array(n);
    for (let i = 0; i < n; i++) weighted[i] = originalWeight[i] * sampleFg[i];
    edgeWeight = sums(null, 0, weighted, sampleRadius);
  }

  if (edgeRadius > 2) {
    // Thin structures (chains, wires) have no deep product pixels: sample them one pixel inside instead.
    const shallowFg = erode(foreground, width, height, 1);
    const shallowCount = sums(null, 0, shallowFg, sampleRadius);
    const shallowSums = (src: Uint8Array): Float32Array[] =>
      [0, 1, 2].map((c) => sums(src, c, shallowFg, sampleRadius));
    const shallowGenerated = shallowSums(generated);
    const shallowOriginal = useOriginal ? shallowSums(original) : undefined;
    let shallowWeight: Float32Array | undefined;
    if (useOriginal) {
      const weighted = new Float32Array(n);
      for (let i = 0; i < n; i++) weighted[i] = originalWeight[i] * shallowFg[i];
      shallowWeight = sums(null, 0, weighted, sampleRadius);
    }
    for (let j = 0; j < bandCount; j++) {
      if (fgCount[j] > 0 || shallowCount[j] === 0) continue;
      fgCount[j] = shallowCount[j];
      for (let c = 0; c < 3; c++) {
        generatedLocal.fg[c][j] = shallowGenerated[c][j];
        if (originalLocal) originalLocal.fg[c][j] = shallowOriginal[c][j];
      }
      if (edgeWeight) edgeWeight[j] = shallowWeight[j];
    }
  }

  for (let j = 0; j < bandCount; j++) {
    const i = band[j];
    const o = i * 3;
    const isForeground = foreground[i] === 1;
    const fallback = 0.5 * foreground[i] + 0.5 * soft[j];

    const gen = edgeSample(generated, i, generatedLocal, j, fgCount[j], bgCount[j], white);
    let a = projectAlpha(gen, fallback, isForeground);
    let orig: EdgeSample | undefined;
    let we = 0;
    if (useOriginal) {
      we = fgCount[j] > 0 ? edgeWeight[j] / fgCount[j] : originalWeight[i];
      orig = edgeSample(original, i, originalLocal, j, fgCount[j], bgCount[j], input.originalBackdrop ?? white);
      a = we * projectAlpha(orig, fallback, isForeground) + (1 - we) * a;
    }
    a = clamp(a, floor[j], ceiling[j]);

    const genColour = unmixColour(gen, a);
    const origColour = orig ? unmixColour(orig, a) : genColour;
    for (let c = 0; c < 3; c++) {
      const g = clamp(genColour[c] + offset[c], 0, 255);
      rgb[o + c] = Math.round(we * origColour[c] + (1 - we) * g);
    }
    alpha[i] = Math.round(a * 255);
  }

  return { rgb, alpha };
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/** Product composited on solid #FFFFFF (preview step). */
export async function encodeWhitePreviewPng(cutout: ProductCutout): Promise<Buffer> {
  const { width, height, rgb, alpha } = cutout;
  const out = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const a = alpha[i] / 255;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(rgb[i * 3 + c] * a + 255 * (1 - a));
  }
  return sharp(out, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/** Transparent PNG cropped to the visible product (try-on storage). */
export async function encodeTransparentCutoutPng(cutout: {
  width: number;
  height: number;
  rgb: Uint8Array;
  alpha: Uint8Array;
}): Promise<Buffer> {
  const { width, height, rgb, alpha } = cutout;
  const rgba = new Uint8Array(width * height * 4);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const a = alpha[i];
      rgba[i * 4] = a ? rgb[i * 3] : 255;
      rgba[i * 4 + 1] = a ? rgb[i * 3 + 1] : 255;
      rgba[i * 4 + 2] = a ? rgb[i * 3 + 2] : 255;
      rgba[i * 4 + 3] = a;
      if (a >= 3) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  let image = sharp(rgba, { raw: { width, height, channels: 4 } });
  if (maxX >= minX && maxY >= minY && (maxX - minX + 1 < width || maxY - minY + 1 < height)) {
    image = image.extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
  }
  return image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

// ---------------------------------------------------------------------------
// White-backdrop images → transparent (save step)
// ---------------------------------------------------------------------------

/**
 * Bright white gems often have subtle facet variation; flat studio white does not.
 * Protect high-variance bright regions from backdrop removal.
 */
function protectTexturedBrightRegions(rgb: Uint8Array, width: number, height: number, background: Uint8Array): void {
  const n = width * height;
  const white = new Float32Array(n);
  const spread = new Float32Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    if (!isWhitePixel(rgb[o], rgb[o + 1], rgb[o + 2])) continue;
    white[i] = 1;
    spread[i] = Math.max(rgb[o], rgb[o + 1], rgb[o + 2]) - Math.min(rgb[o], rgb[o + 1], rgb[o + 2]);
  }
  // 5×5 neighbourhood statistics over white neighbours, excluding the pixel itself.
  const samples = boxSum(white, width, height, 2);
  const spreadSum = boxSum(spread, width, height, 2);
  for (let i = 0; i < n; i++) {
    if (!background[i] || !white[i]) continue;
    const count = samples[i] - 1;
    if (count >= 4 && (spreadSum[i] - spread[i]) / count >= 2.5) {
      background[i] = 0;
    }
  }
}

/** Keep the alpha of uploads that are already transparent cutouts (no AI, no re-keying). */
export async function extractTransparentCutout(buffer: Buffer): Promise<Buffer | null> {
  const cutout = await transparentUploadCutout(buffer);
  return cutout ? encodeTransparentCutoutPng(cutout) : null;
}

/** An upload that is already a transparent cutout, as a {@link ProductCutout}; null for opaque images. */
export async function transparentUploadCutout(buffer: Buffer): Promise<ProductCutout | null> {
  const meta = await sharp(buffer).metadata();
  if (!meta.hasAlpha) return null;

  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(CUTOUT_MAX_PX, CUTOUT_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) return null;

  const n = width * height;
  let transparent = 0;
  let total = 0;
  const countBorder = (x: number, y: number): void => {
    total++;
    if (data[(y * width + x) * 4 + 3] < 16) transparent++;
  };
  for (let x = 0; x < width; x++) {
    countBorder(x, 0);
    countBorder(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    countBorder(0, y);
    countBorder(width - 1, y);
  }
  if (transparent / total <= 0.4) return null;

  const rgb = new Uint8Array(n * 3);
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = data[i * 4];
    rgb[i * 3 + 1] = data[i * 4 + 1];
    rgb[i * 3 + 2] = data[i * 4 + 2];
    alpha[i] = data[i * 4 + 3];
  }
  return { width, height, rgb, alpha, stats: passthroughStats(alpha, width, height, 0) };
}

/**
 * Remove the white backdrop of a white-background image (AI preview or studio photo) for try-on storage.
 * Keys out border-connected white plus large flat white holes, then un-mixes white from edge pixels so the
 * cutout has soft, halo-free edges.
 */
export async function removeWhiteBackground(buffer: Buffer): Promise<Buffer> {
  const existing = await extractTransparentCutout(buffer);
  if (existing) return existing;
  return encodeTransparentCutoutPng(await whiteBackdropCutout(buffer));
}

/**
 * Cutout of a photo that already has a white backdrop, without the model: the model tends to "redraw" such photos
 * as sketches since there is nothing for it to remove, while the deterministic key keeps the pixels exact.
 */
export async function whiteBackdropCutout(buffer: Buffer): Promise<ProductCutout> {
  const { data, width, height } = await loadRgb(buffer);
  const { rgb, alpha, holesRemoved } = keyOutWhiteBackdrop(data, width, height);
  return { width, height, rgb, alpha, stats: passthroughStats(alpha, width, height, holesRemoved) };
}

/** Stats for a cutout that did not go through the model (white key or an upload kept as-is). */
function passthroughStats(alpha: Uint8Array, width: number, height: number, holesRemoved: number): ProductCutoutStats {
  const mask = alphaMask(alpha);
  return {
    alignment: IDENTITY_ALIGNMENT,
    alignmentApplied: false,
    agreement: 1,
    originalPixels: true,
    holesRemoved,
    foregroundRatio: Math.round((countMask(mask) / alpha.length) * 1000) / 1000,
    whiteBackdrop: true,
    unchangedPhoto: false,
    keyedOnly: true,
    fragments: countFragments(mask, width, height),
    darkFraction: 0,
  };
}

/** Pure white-key + edge matting step of {@link removeWhiteBackground} (exported for offline verification). */
export function keyOutWhiteBackdrop(
  data: Uint8Array,
  width: number,
  height: number,
): { rgb: Uint8Array; alpha: Uint8Array; holesRemoved: number } {
  const n = width * height;
  const tolerance = clamp(
    borderWhiteDistanceQuantile(data, width, height, 0.95) + 6,
    WHITE_KEY_TOLERANCE,
    WHITE_KEY_MAX_TOLERANCE,
  );

  // A contact shadow is neutral grey, but so is silver, and a white stone is neutral too. Local gradients do not
  // separate them (a soft shadow and an anti-aliased metal edge have the same slope), so grey is only keyed where
  // it is both smooth and untextured — metal edges and faceted stones fail that test and stay.
  const background = floodFromBorder(backdropMask(data, n, tolerance, shadowGate(data, width, height)), width, height);

  protectTexturedBrightRegions(data, width, height, background);
  // Shadow pools and backdrop islands the product cut off from the border go too, provided they are flat.
  const holesRemoved = removeFlatWhiteHoles(background, data, width, height, tolerance, 1.8, {
    includeShadows: true,
  });
  removeSpeckles(background, width, height);

  if (countMask(background) === n) {
    throw new Error('No product found on the white background');
  }

  // Our own previews have exact #FFFFFF borders and clean edges; photos need the wider band to absorb ringing.
  const cleanWhite = borderWhiteDistanceQuantile(data, width, height, 0.98) === 0;
  const matte = composeMatte({
    width,
    height,
    background,
    generated: data,
    edgeRadius: cleanWhite ? EDGE_BAND_RADIUS : PHOTO_EDGE_BAND_RADIUS,
  });
  return { ...matte, holesRemoved };
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
  const at = (x: number, y: number): void => {
    const o = (y * info.width + x) * info.channels;
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

/**
 * True when the backdrop is exactly #FFFFFF everywhere along the border — the signature of an image this pipeline
 * already produced. A photographed white backdrop always carries some sensor noise, so it does not qualify.
 */
export async function hasGeneratedWhiteBackdrop(buffer: Buffer): Promise<boolean> {
  const { data, width, height } = await loadRgb(buffer);
  return borderWhiteDistanceQuantile(data, width, height, 0.98) === 0;
}

/** Keep API preview payloads under Lambda's 6MB response limit. */
export async function compressPngForApiPreview(buffer: Buffer, maxDimension = 1024): Promise<Buffer> {
  return sharp(buffer)
    .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}
