import { PromptContext } from './prompt-context';
import { ScenePrompt } from './scene-prompt';
import { CAMPAIGN_SCENES, MarketingStyle } from '../../../shared';

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
      scene:
        'worn by one adult male or female model chosen to suit the piece, against a pastel peach studio backdrop with soft shadows',
      motion: 'model makes a subtle graceful turn while the jewellery stays unobscured and centered',
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
      scene:
        'worn by one adult male or female model chosen to suit the piece, with jasmine and warm festive lights softly out of focus',
      motion: 'model makes a gentle turn toward the light while the jewellery stays clearly visible',
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
      scene:
        'worn by one adult male or female model chosen to suit the piece, against a dark boutique backdrop with a soft spotlight',
      motion: 'model turns slightly toward camera; the jewellery remains sharp, centered, and unobscured',
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
      scene:
        'worn by one adult male or female model chosen to suit the piece, in soft window light against a clean neutral background',
      motion: 'model makes a small natural turn while the jewellery stays clearly visible',
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
    'do not alter the jewellery. Exactly one scene must feature one adult male or female model, chosen to suit the product, ' +
    'wearing and showcasing it naturally with the jewellery prominent and unobscured; all other scenes have no people or hands. ' +
    'Do not add text or logos. "motion" describes one slow, smooth camera movement or subtle model gesture in under 20 words; ' +
    'keep the jewellery in frame and avoid fast movement, sudden zooms, or handling. ' +
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
    .map((p) => ({ scene: clean((p as ScenePrompt)?.scene, 300), motion: clean((p as ScenePrompt)?.motion, 240) }))
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
  const includesModel = /\b(model|person|woman|man|female|male)\b/i.test(scene);
  const people = includesModel
    ? 'Show only the one adult model described in the scene, physically wearing the jewellery on the body (touching the skin, at its real-life size, not held up or floating), with natural anatomy and a pose that never covers it.'
    : 'No people or hands.';
  return (
    `Professional vertical product photograph for a jewellery advertisement. Place the exact jewellery piece from the ` +
    `reference image (${title}) ${scene}. Keep the jewellery identical: same design, shape, metal colour (silver stays ` +
    `silver, gold stays gold), enamel colours, stones and fine details; do not add, remove or redesign any part. Product centred and fully visible, sharp focus, photorealistic, ` +
    `high detail, ${people} No text or watermark.`
  );
}

/** Video prompt for a scene clip. */
export function buildSceneVideoPrompt(motion: string): string {
  return (
    `Create one photorealistic 5-second, vertical 9:16 luxury jewellery commercial shot from the supplied reference image. ` +
    `REFERENCE AND SUBJECT: use the image as the exact opening frame and identity reference. Lock the jewellery's identity for the entire shot: same silhouette, same proportions, ` +
    `same metal colour, same stone count, same stone placement, same setting, and same fine craftsmanship. No redesign, no simplification, no new elements, no duplicate jewellery. ` +
    `Keep the same wearer if present; preserve the wearer's identity, facial features, wardrobe, and background. ` +
    `ACTION: ${motion}. Perform only this one action, as a small graceful movement with a clear beginning, a fluid middle, ` +
    `and a calm settled finish. Ease in and out naturally; maintain realistic speed and avoid sudden changes of direction. ` +
    `CAMERA AND COMPOSITION: use a steady, controlled camera path that supports the action, with no handheld shake. Keep ` +
    `the complete jewellery comfortably inside the frame, prominent, unobscured, and in sharp focus for the entire shot. ` +
    `Allow only the gentle position or scale change required by the requested motion; never crop, zoom away, or obscure the piece. ` +
    `No sudden reframing, abrupt zoom, extreme close-up, or focus hunting. ` +
    `LIGHT AND MATERIAL: use soft premium studio lighting, gentle edge highlights, natural skin tones when a model is present, ` +
    `and physically plausible reflections on metal and stones. Let highlights shift subtly with the motion while the design ` +
    `remains stable. CONTINUITY: one uninterrupted shot, consistent background and exposure, no cuts, transitions, new people, ` +
    `hands, props, text, logos, duplicate jewellery, flicker, or added or missing details.`
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
  'low quality, worst quality, blurry, out of focus, flicker, jitter, judder, jerky movement, frame stutter, deformed, distorted, warped ' +
  'geometry, melting, changing jewellery design, metal colour change, silver turning gold, colour shift, altered enamel colours, altered silhouette, wrong proportions, altered stone count, added or missing stones, ' +
  'extra hands, extra fingers, deformed hands, extra people, duplicate jewellery, extra objects, abrupt cuts, camera shake, ' +
  'extreme close-up, cropped product, motion blur, text, subtitles, watermark, static frame, overexposed, oversaturated, jpeg artifacts';
