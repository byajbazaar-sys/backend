import sharp from 'sharp';

import type { ProductCutout } from './product-image.util';
import {
  IDENTITY_ALIGNMENT,
  boxMean,
  clamp,
  countMask,
  dilate,
  erode,
  floodFromBorder,
  histogramQuantile,
  labelComponents,
  luma,
  smoothstep,
  type Rgb,
} from './product-matting.util';

/**
 * Jewellery photographed on a shop display tray (black or grey velvet).
 *
 * The generative route repaints the photo onto white and then treats near-white as backdrop, which erases silver
 * (silver *is* near-white) and loses thin chain links at the model's 512 px input. On a dark, neutral tray the
 * product is simply brighter or more colourful than the tray, so it is keyed directly from the original pixels at
 * full working resolution — exact links, no model call, no quota.
 */

/** Work at the photo's own resolution (phone uploads are ~2048 px) so engraving and fine links survive. */
const CUTOUT_MAX_PX = 2048;
const SAMPLE_PX = 400;

/** Tray must be neutral and not brighter than mid-grey velvet. */
const MAX_BACKDROP_LUMA = 115;
const MAX_BACKDROP_CHROMA = 22;
/** Share of the centre that must look like the tray (product + tray share the centre). */
const MIN_BACKDROP_SHARE = 0.55;
const BACKDROP_MATCH_DISTANCE = 32;
/** Product share of the centre, as seen at the foreground threshold. */
const MIN_PRODUCT_SHARE = 0.004;
const MAX_PRODUCT_SHARE = 0.4;

/** Score = brightness above the tray + colour difference from it. */
const SCORE_LOW = 40;
const SCORE_HIGH = 105;
const CHROMA_WEIGHT = 1.3;

/** Plausibility of the final cutout; outside these the caller falls back to the model. */
const MIN_FOREGROUND_RATIO = 0.002;
const MAX_FOREGROUND_RATIO = 0.45;
const MAX_FRAGMENTS = 80;
/**
 * Grey velvet is textured and the model already handles coloured (gold) products on it well, so a grey-tray key is
 * only trusted when it comes out compact; otherwise the caller keeps using the model.
 */
const GREY_TRAY_LUMA = 60;
const MAX_GREY_TRAY_FRAGMENTS = 8;

/**
 * Matte. Shaded silver facets score ~60–80 while the velvet itself stays under ~30, so inside the product the alpha
 * ramp starts just above this photo's velvet noise instead of at SCORE_LOW; a fixed 40→105 ramp left dark facets
 * see-through. Velvet showing through the gaps between links stays below the noise and is cut out.
 */
const NOISE_QUANTILE = 0.95;
const NOISE_MARGIN = 8;
const MIN_RAMP_START = 16;
const RAMP_WIDTH = 26;
/** Specks smaller than this share of the photo must touch the product closely to be kept (velvet lint). */
const SPECK_SHARE = 0.00015;
const SPECK_REACH_FACTOR = 0.3;

export interface DisplayBackdrop {
  color: Rgb;
  luma: number;
}

export interface DisplayBackdropCutout extends ProductCutout {
  backdrop: DisplayBackdrop;
}

function chromaVector(r: number, g: number, b: number): Rgb {
  const l = luma(r, g, b);
  return [r - l, g - l, b - l];
}

/** How much a pixel stands out from the tray: brighter or differently coloured (shadows/folds only darken). */
function productScore(r: number, g: number, b: number, bd: DisplayBackdrop, bdChroma: Rgb): number {
  const l = luma(r, g, b);
  const [cr, cg, cb] = chromaVector(r, g, b);
  const chroma = Math.hypot(cr - bdChroma[0], cg - bdChroma[1], cb - bdChroma[2]);
  return Math.max(0, l - bd.luma) + CHROMA_WEIGHT * chroma;
}

function median(values: Uint8Array | number[], count: number): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < count; i++) hist[values[i]]++;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc * 2 >= count) return v;
  }
  return 255;
}

/**
 * Detect a dark/grey neutral display tray filling the centre of the photo with a small bright or coloured product
 * on it. Returns the tray colour, or null for anything else (white studio shots, people, packaging, outdoor…).
 */
export async function detectDisplayBackdrop(buffer: Buffer): Promise<DisplayBackdrop | null> {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(SAMPLE_PX, SAMPLE_PX, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const x0 = Math.floor(width * 0.15);
  const x1 = Math.ceil(width * 0.85);
  const y0 = Math.floor(height * 0.15);
  const y1 = Math.ceil(height * 0.85);
  const count = (x1 - x0) * (y1 - y0);
  const rs = new Uint8Array(count);
  const gs = new Uint8Array(count);
  const bs = new Uint8Array(count);
  let k = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * width + x) * channels;
      rs[k] = data[o];
      gs[k] = data[o + 1];
      bs[k] = data[o + 2];
      k++;
    }
  }

  const color: Rgb = [median(rs, count), median(gs, count), median(bs, count)];
  const bd: DisplayBackdrop = { color, luma: luma(color[0], color[1], color[2]) };
  const bdChromaSpread = Math.max(...color) - Math.min(...color);
  if (bd.luma > MAX_BACKDROP_LUMA || bdChromaSpread > MAX_BACKDROP_CHROMA) return null;

  const bdChroma = chromaVector(color[0], color[1], color[2]);
  let matches = 0;
  let product = 0;
  for (let i = 0; i < count; i++) {
    const dr = rs[i] - color[0];
    const dg = gs[i] - color[1];
    const db = bs[i] - color[2];
    if (Math.hypot(dr, dg, db) <= BACKDROP_MATCH_DISTANCE) matches++;
    if (productScore(rs[i], gs[i], bs[i], bd, bdChroma) >= SCORE_HIGH) product++;
  }
  const backdropShare = matches / count;
  const productShare = product / count;
  if (backdropShare < MIN_BACKDROP_SHARE) return null;
  if (productShare < MIN_PRODUCT_SHARE || productShare > MAX_PRODUCT_SHARE) return null;
  return bd;
}

/** Fill every row and column between the mask's extremes (an orthogonally convex hull). */
function orthogonalHull(mask: Uint8Array, width: number, height: number): Uint8Array {
  const rows = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    let lo = -1;
    let hi = -1;
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        if (lo < 0) lo = x;
        hi = x;
      }
    }
    for (let x = lo; lo >= 0 && x <= hi; x++) rows[y * width + x] = 1;
  }
  const out = rows.slice();
  for (let x = 0; x < width; x++) {
    let lo = -1;
    let hi = -1;
    for (let y = 0; y < height; y++) {
      if (rows[y * width + x]) {
        if (lo < 0) lo = y;
        hi = y;
      }
    }
    for (let y = lo; lo >= 0 && y <= hi; y++) out[y * width + x] = 1;
  }
  return out;
}

/** Largest 4-connected component of a mask. */
function largestComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const { components, pixels } = labelComponents(mask, width, height);
  const out = new Uint8Array(mask.length);
  let best = components[0];
  for (const c of components) if (c.size > best.size) best = c;
  if (!best) return out;
  for (let p = best.start; p < best.start + best.size; p++) out[pixels[p]] = 1;
  return out;
}

/**
 * Key the product off a display tray. Throws when the photo does not yield a plausible cutout so the caller can
 * fall back to the model.
 */
export async function displayBackdropCutout(buffer: Buffer, bd: DisplayBackdrop): Promise<DisplayBackdropCutout> {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(CUTOUT_MAX_PX, CUTOUT_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const n = width * height;
  const bdChroma = chromaVector(bd.color[0], bd.color[1], bd.color[2]);

  const score = new Float32Array(n);
  const trayLike = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += channels) {
    const s = productScore(data[o], data[o + 1], data[o + 2], bd, bdChroma);
    score[i] = s;
    trayLike[i] = s < SCORE_LOW ? 1 : 0;
  }

  // The tray: close the tray-like pixels over thin products, keep the biggest region, fill what it encloses, then
  // take its row/column hull so products lying over the tray edge stay inside it. Shop clutter outside is ignored.
  const longSide = Math.max(width, height);
  const closeRadius = Math.max(4, Math.round(longSide * 0.012));
  const closed = erode(dilate(trayLike, width, height, closeRadius), width, height, closeRadius);
  const tray = largestComponent(closed, width, height);
  const outside = floodFromBorder(
    tray.map((v) => (v ? 0 : 1)),
    width,
    height,
  );
  const filled = outside.map((v) => (v ? 0 : 1));
  if (countMask(filled) < n * 0.25) throw new Error('Display tray not found');
  const region = orthogonalHull(filled, width, height);

  // Foreground components; drop velvet lint and the tray's lit bevel (thin strips hugging the tray outline).
  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) fg[i] = region[i] && score[i] >= (SCORE_LOW + SCORE_HIGH) / 2 ? 1 : 0;
  const { components, pixels } = labelComponents(fg, width, height);
  if (!components.length) throw new Error('No product found on the display tray');
  const largest = Math.max(...components.map((c) => c.size));
  const minSize = Math.max(40, Math.round(n * 0.00004));
  const bandWidth = Math.max(4, Math.round(longSide * 0.008));
  const inner = erode(region, width, height, bandWidth);

  const candidates = components.filter((c) => {
    if (c.size < minSize) return false;
    let inBand = 0;
    for (let p = c.start; p < c.start + c.size; p++) if (!inner[pixels[p]]) inBand++;
    return !(inBand / c.size >= 0.6 && c.size < largest * 0.5);
  });
  if (!candidates.length) throw new Error('No product found on the display tray');

  // Grow from the main piece: a chain that the threshold broke into links stays connected through its
  // neighbours, while lint, the next tray's jewellery and shop clutter at the edges are too far away to join.
  const reach = Math.max(6, Math.round(longSide * 0.03));
  const keep = new Uint8Array(n);
  const added = new Set<number>();
  const main = candidates.reduce((a, b) => (b.size > a.size ? b : a));
  const addComponent = (idx: number): void => {
    const c = candidates[idx];
    for (let p = c.start; p < c.start + c.size; p++) keep[pixels[p]] = 1;
    added.add(idx);
  };
  addComponent(candidates.indexOf(main));
  const speckSize = n * SPECK_SHARE;
  const speckReach = Math.max(3, Math.round(reach * SPECK_REACH_FACTOR));
  for (let pass = 0; pass < 12; pass++) {
    const zone = dilate(keep, width, height, reach);
    const closeZone = dilate(keep, width, height, speckReach);
    let grew = false;
    candidates.forEach((c, idx) => {
      if (added.has(idx)) return;
      // A broken link sits right against its neighbours; velvet lint lies a little way off.
      const within = c.size < speckSize ? closeZone : zone;
      for (let p = c.start; p < c.start + c.size; p++) {
        if (within[pixels[p]]) {
          addComponent(idx);
          grew = true;
          return;
        }
      }
    });
    if (!grew) break;
  }
  const fragments = added.size;

  const kept = countMask(keep);
  const foregroundRatio = kept / n;
  if (foregroundRatio < MIN_FOREGROUND_RATIO || foregroundRatio > MAX_FOREGROUND_RATIO) {
    throw new Error(`Implausible display-tray cutout (foreground ${foregroundRatio.toFixed(4)})`);
  }
  const fragmentLimit = bd.luma > GREY_TRAY_LUMA ? MAX_GREY_TRAY_FRAGMENTS : MAX_FRAGMENTS;
  if (fragments > fragmentLimit) throw new Error(`Display-tray cutout too fragmented (${fragments} pieces)`);

  const { rgb, alpha } = matteProduct(data, channels, width, height, score, keep, region, bd);

  return {
    width,
    height,
    rgb,
    alpha,
    backdrop: bd,
    stats: {
      alignment: IDENTITY_ALIGNMENT,
      alignmentApplied: false,
      agreement: 1,
      originalPixels: true,
      holesRemoved: 0,
      foregroundRatio: Math.round(foregroundRatio * 1000) / 1000,
      whiteBackdrop: false,
      unchangedPhoto: false,
      keyedOnly: true,
      fragments,
      darkFraction: 0,
    },
  };
}

/**
 * Alpha and colour for the kept product.
 *
 * - Body: the kept pieces closed over small gaps. Alpha ramps from just above this photo's velvet noise, so shaded
 *   metal is solid and only velvet (in the gaps between links) is cut out.
 * - Outline (outermost ~2 px of the body): edge pixels mix metal with velvet. Their alpha is the pixel's position
 *   between the tray colour and the nearby solid metal colour, and their colour is that metal colour with the tray
 *   removed — no dark velvet rim, no stair-stepped hard threshold.
 */
function matteProduct(
  data: Buffer,
  channels: number,
  width: number,
  height: number,
  score: Float32Array,
  keep: Uint8Array,
  region: Uint8Array,
  bd: DisplayBackdrop,
): { rgb: Uint8Array; alpha: Uint8Array } {
  const n = width * height;
  const longSide = Math.max(width, height);

  // Velvet noise: tray pixels well away from the product.
  const away = dilate(keep, width, height, Math.max(12, Math.round(longSide * 0.02)));
  const hist = new Uint32Array(256);
  let samples = 0;
  for (let i = 0; i < n; i++) {
    if (region[i] && !away[i]) {
      hist[Math.min(255, Math.round(score[i]))]++;
      samples++;
    }
  }
  const noise = samples ? histogramQuantile(hist, samples, NOISE_QUANTILE) : SCORE_LOW - NOISE_MARGIN;
  const lo = clamp(noise + NOISE_MARGIN, MIN_RAMP_START, SCORE_LOW);
  const hi = lo + RAMP_WIDTH;

  const closeRadius = Math.max(2, Math.round(longSide * 0.003));
  const body = erode(dilate(keep, width, height, closeRadius), width, height, closeRadius);
  for (let i = 0; i < n; i++) if (!region[i]) body[i] = 0;

  const alpha = new Uint8Array(n);
  const af = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    af[i] = keep[i] ? 1 : body[i] ? smoothstep(lo, hi, score[i]) : 0;
  }

  // Local solid-metal colour from confident pixels, for the outline.
  const solid = new Float32Array(n);
  const planes = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0, o = 0; i < n; i++, o += channels) {
    if (af[i] >= 0.99) {
      solid[i] = 1;
      planes[0][i] = data[o];
      planes[1][i] = data[o + 1];
      planes[2][i] = data[o + 2];
    }
  }
  const fgRadius = Math.max(3, Math.round(longSide * 0.003));
  const solidMean = boxMean(solid, width, height, fgRadius);
  const fgMean = planes.map((plane) => boxMean(plane, width, height, fgRadius));
  const inner = erode(body, width, height, 2);
  const outlineReach = dilate(body, width, height, 1);

  const rgb = new Uint8Array(n * 3);
  for (let i = 0, o = 0; i < n; i++, o += channels) {
    const c = [data[o], data[o + 1], data[o + 2]];
    let a = af[i];
    let colour = c;
    const onOutline = outlineReach[i] && !inner[i] && region[i];
    if (onOutline && solidMean[i] > 0.02) {
      const f = fgMean.map((m) => m[i] / solidMean[i]);
      const d = [f[0] - bd.color[0], f[1] - bd.color[1], f[2] - bd.color[2]];
      const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      if (dd > 400) {
        const proj = ((c[0] - bd.color[0]) * d[0] + (c[1] - bd.color[1]) * d[1] + (c[2] - bd.color[2]) * d[2]) / dd;
        if (!keep[i]) {
          // Inside the body never go below the score's alpha (dark metal stays solid); just outside it, the score
          // caps the alpha so lint and glare next to the chain can't creep in.
          const cap = body[i] ? 1 : smoothstep(lo, hi, score[i]);
          a = Math.min(cap, Math.max(clamp(proj, 0, 1), af[i]));
          colour = f;
        }
      }
    }
    if (a < 1 / 255) a = 0;
    af[i] = a;
    alpha[i] = Math.round(a * 255);
    for (let k = 0; k < 3; k++) {
      // Solid pixels keep the photo's own colour; only partial (edge) pixels are unmixed from the tray.
      const v = a >= 0.98 || a <= 0 ? c[k] : colour === c ? (c[k] - (1 - a) * bd.color[k]) / a : colour[k];
      rgb[i * 3 + k] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  removeStrayIslands(alpha, keep, width, height);
  return { rgb, alpha };
}

/** Solid islands smaller than this share of the photo that don't touch the kept product are glints, not metal. */
const ISLAND_SHARE = 0.000006;

/**
 * The lower alpha ramp lets glints in the gaps between links (a few pixels each) turn solid. Drop any solid island
 * that doesn't touch the kept product and is tiny, together with its soft edge.
 */
function removeStrayIslands(alpha: Uint8Array, keep: Uint8Array, width: number, height: number): void {
  const n = width * height;
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = alpha[i] >= 128 ? 1 : 0;
  const { components, pixels } = labelComponents(solid, width, height);
  const maxIsland = Math.max(8, Math.round(n * ISLAND_SHARE));
  const stray = new Uint8Array(n);
  for (const c of components) {
    if (c.size > maxIsland) continue;
    let touchesProduct = false;
    for (let p = c.start; p < c.start + c.size; p++) {
      if (keep[pixels[p]]) {
        touchesProduct = true;
        break;
      }
    }
    if (touchesProduct) continue;
    for (let p = c.start; p < c.start + c.size; p++) stray[pixels[p]] = 1;
  }
  const strayZone = dilate(stray, width, height, 1);
  for (let i = 0; i < n; i++) if (strayZone[i] && !keep[i]) alpha[i] = 0;
}
