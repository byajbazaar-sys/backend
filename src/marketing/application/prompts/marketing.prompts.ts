import { CAMPAIGN_SCENES, MarketingStyle } from '../enums';

export interface ScenePrompt {
  /** Where/how the product is staged (image-to-image). */
  scene: string;
  /** Camera / light movement (video model). */
  motion: string;
}

export interface PromptContext {
  title: string;
  style: MarketingStyle;
  businessName?: string | null;
  metalType?: string;
  purity?: string;
  categoryName?: string;
}

const STYLE_BRIEF: Record<MarketingStyle, string> = {
  studio: 'premium studio sets, gradient backdrops, soft rim light, clean commercial look',
  festive: 'Indian festive moods: diyas, marigolds, rangoli, warm golden bokeh, celebration',
  luxury: 'luxury boutique: black velvet, dramatic spotlights, mirrors, deep shadows, sparkle',
  minimal: 'minimal and airy: marble, linen, soft daylight, neutral tones, calm elegance',
};

/** Hand-written scenes per style, used when the text model is unavailable or returns something unusable. */
const FALLBACK: Record<MarketingStyle, ScenePrompt[]> = {
  studio: [
    {
      scene: 'on a glossy black acrylic plinth with a soft grey gradient backdrop and a thin rim light',
      motion: 'slow orbit around the piece, soft studio highlights gliding across the metal',
    },
    {
      scene: 'floating above a mirror floor with soft reflections and a warm key light',
      motion: 'gentle push-in towards the piece, reflections shimmering',
    },
    {
      scene: 'on a white sculpted pedestal with a pastel peach backdrop and soft shadows',
      motion: 'slow tilt up revealing the full piece, soft light sweep',
    },
    {
      scene: 'on a rotating turntable with a deep blue backdrop and crisp edge lighting',
      motion: 'smooth turntable rotation with sparkling highlights',
    },
    {
      scene: 'close-up on a satin cloth with shallow depth of field and creamy bokeh',
      motion: 'macro dolly across the details, focus breathing gently',
    },
  ],
  festive: [
    {
      scene: 'on a brass thali surrounded by lit diyas and marigold petals, warm golden bokeh',
      motion: 'slow push-in, flickering diya light dancing on the metal',
    },
    {
      scene: 'on a red silk saree fold with rangoli colours and soft festive lights',
      motion: 'gentle orbit, festive lights twinkling in the background',
    },
    {
      scene: 'beside a carved wooden jewellery box with rose petals and incense smoke',
      motion: 'slow dolly across, smoke drifting softly',
    },
    {
      scene: 'on a banana-leaf platter with jasmine strings and temple bells in soft focus',
      motion: 'slow tilt down onto the piece, petals falling gently',
    },
    {
      scene: 'against a wall of glowing paper lanterns at dusk, warm and celebratory',
      motion: 'smooth crane down to the piece, lanterns swaying slightly',
    },
  ],
  luxury: [
    {
      scene: 'on a black velvet bust under a single dramatic spotlight',
      motion: 'slow turntable rotation, spotlight creating sparkling glints',
    },
    {
      scene: 'in an open leather jewellery case lined with champagne satin',
      motion: 'gentle push-in as the light sweeps across the stones',
    },
    {
      scene: 'on a marble vanity beside a crystal perfume bottle, moody low-key light',
      motion: 'slow orbit with soft reflections in the crystal',
    },
    {
      scene: 'on dark rippled water reflecting golden light, mysterious and rich',
      motion: 'slow dolly over the surface, ripples catching the light',
    },
    {
      scene: 'on a gold-leaf textured surface with deep shadows and a halo light',
      motion: 'slow tilt up, highlights blooming on the metal',
    },
  ],
  minimal: [
    {
      scene: 'on a white marble slab with soft morning window light and long gentle shadows',
      motion: 'very slow dolly-in, daylight shifting softly',
    },
    {
      scene: 'on natural linen with a dried pampas stem, airy neutral tones',
      motion: 'gentle orbit, soft breeze moving the pampas',
    },
    {
      scene: 'on a pale stone pebble arrangement with soft diffused light',
      motion: 'slow tilt across the piece, calm and still',
    },
    {
      scene: 'on a beige ceramic dish beside a sprig of eucalyptus, clean composition',
      motion: 'smooth push-in, light glinting softly',
    },
    {
      scene: 'floating against a seamless warm-white backdrop with a soft shadow below',
      motion: 'slow rotation, minimal and elegant',
    },
  ],
};

export function buildPromptWriterSystem(): string {
  return (
    'You write shot lists for short vertical jewellery advertisement videos (Instagram Reels). ' +
    `Reply with ONLY a JSON array of exactly ${CAMPAIGN_SCENES} objects, each {"scene": string, "motion": string}. ` +
    '"scene" describes where and how the jewellery is staged (setting, props, background, lighting) in under 30 words; ' +
    'never describe or change the jewellery itself, never add people, hands, text or logos. ' +
    '"motion" describes one slow, smooth camera or light movement in under 15 words. ' +
    `Make all ${CAMPAIGN_SCENES} scenes clearly different from each other.`
  );
}

export function buildPromptWriterUser(ctx: PromptContext): string {
  const facts = [ctx.title, ctx.categoryName, ctx.metalType, ctx.purity].filter(Boolean).join(', ');
  return (
    `Product: ${facts || 'a piece of jewellery'}.` +
    (ctx.businessName ? ` Shop: ${ctx.businessName}.` : '') +
    ` Visual direction: ${STYLE_BRIEF[ctx.style]}.`
  );
}

/** Extracts the scene list from a model reply; tops up / falls back with curated scenes. */
export function parseScenePrompts(reply: string, style: MarketingStyle): { scenes: ScenePrompt[]; fromModel: number } {
  let parsed: unknown;
  const match = /\[[\s\S]*\]/.exec(reply);
  try {
    parsed = JSON.parse(match ? match[0] : reply);
  } catch {
    parsed = null;
  }
  const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const fromModel = (Array.isArray(parsed) ? parsed : [])
    .map((p) => ({ scene: clean((p as ScenePrompt)?.scene, 300), motion: clean((p as ScenePrompt)?.motion, 160) }))
    .filter((p) => p.scene.length >= 12 && p.motion.length >= 6)
    .slice(0, CAMPAIGN_SCENES);
  const scenes = [...fromModel, ...FALLBACK[style].slice(fromModel.length)].slice(0, CAMPAIGN_SCENES);
  return { scenes, fromModel: fromModel.length };
}

export function fallbackScene(style: MarketingStyle, index: number): ScenePrompt {
  return FALLBACK[style][index % FALLBACK[style].length];
}

/** Image-to-image prompt: restage the exact product. */
export function buildSceneImagePrompt(scene: string, title: string): string {
  return (
    `Professional vertical product photograph for a jewellery advertisement. Place the exact jewellery piece from the ` +
    `reference image (${title}) ${scene}. Keep the jewellery identical: same design, shape, metal colour, stones and fine ` +
    `details; do not add, remove or redesign any part. Product centred and fully visible, sharp focus, photorealistic, ` +
    `high detail, no text, no watermark, no hands, no people.`
  );
}

/** Video prompt for a scene clip. */
export function buildSceneVideoPrompt(motion: string): string {
  return (
    `Cinematic vertical jewellery advertisement. Preserve the exact design, shape, colours, material and fine details of ` +
    `the jewellery from the reference image. ${motion}. Shallow depth of field, premium commercial look, sharp focus, ` +
    `high detail, stable and consistent geometry.`
  );
}

export function buildLogoImagePrompt(businessName: string): string {
  return (
    `Elegant luxury jewellery brand logo for "${businessName}". The text "${businessName}" written clearly in refined ` +
    `serif lettering, gold foil on a deep black background, with a small minimal emblem (diamond or ornamental motif) ` +
    `above the name. Centred, vertical composition, generous empty space, crisp vector-like edges, high contrast, ` +
    `no other text, no mockup, no people.`
  );
}

export const LOGO_VIDEO_PROMPT =
  'Elegant logo reveal: gold shimmer sweeps across the lettering, soft light rays and fine sparkles, slow gentle zoom ' +
  'in, the logo stays sharp, perfectly still and unchanged, premium luxury brand intro.';

export const VIDEO_NEGATIVE =
  'low quality, worst quality, blurry, out of focus, flicker, jitter, frame stutter, deformed, distorted, warped ' +
  'geometry, melting, extra objects, duplicated objects, text, subtitles, watermark, static frame, overexposed, ' +
  'oversaturated, jpeg artifacts';
