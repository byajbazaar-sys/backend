import { PromptContext } from './prompt-context';
import { ScenePrompt } from './scene-prompt';
import { CAMPAIGN_SCENES, MarketingStyle } from '../../../shared';

const STYLE_BRIEF: Record<MarketingStyle, string> = {
  studio: 'premium studio sets, gradient backdrops, soft rim light, clean commercial look',
  festive: 'Indian festive moods: diyas, marigolds, rangoli, warm golden bokeh, celebration',
  luxury: 'luxury boutique: black velvet, dramatic spotlights, mirrors, deep shadows, sparkle',
  minimal: 'minimal and airy: marble, linen, soft daylight, neutral tones, calm elegance',
};

/**
 * Hand-written scenes per style (the campaign's five scenes). Marketing shows the jewellery only — no model, no hands —
 * and every scene rests the piece on a surface or display: "floating" or "turntable" stagings made the video model
 * spin the piece.
 */
const FALLBACK: Record<MarketingStyle, ScenePrompt[]> = {
  studio: [
    {
      scene: 'on a glossy black acrylic plinth with a soft grey gradient backdrop and a thin rim light',
      motion: 'very slow camera push-in, soft studio highlights gliding across the still metal',
    },
    {
      scene: 'resting on a mirror floor with soft reflections and a warm key light',
      motion: 'gentle push-in towards the piece, reflections shimmering',
    },
    {
      scene: 'on a velvet jewellery bust against a pastel peach studio backdrop with soft shadows',
      motion: 'very slow camera push-in towards the jewellery, soft highlights gliding across the metal',
    },
    {
      scene: 'on a round display plinth with a deep blue backdrop and crisp edge lighting',
      motion: 'slow camera tilt down onto the still piece, sparkling highlights',
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
      motion: 'slow sideways camera dolly, festive lights twinkling in the background',
    },
    {
      scene: 'beside a carved wooden jewellery box with rose petals and incense smoke',
      motion: 'slow dolly across, smoke drifting softly',
    },
    {
      scene: 'on a velvet jewellery bust among fresh jasmine flowers, warm festive lights softly out of focus',
      motion: 'warm light shifts softly across the metal, very slow camera push-in',
    },
    {
      scene: 'resting on a carved stone ledge before a wall of glowing paper lanterns at dusk, warm and celebratory',
      motion: 'smooth crane down to the piece, lanterns swaying slightly',
    },
  ],
  luxury: [
    {
      scene: 'on a black velvet bust under a single dramatic spotlight',
      motion: 'very slow camera push-in, the spotlight creating sparkling glints',
    },
    {
      scene: 'in an open leather jewellery case lined with champagne satin',
      motion: 'gentle push-in as the light sweeps across the stones',
    },
    {
      scene: 'on a smoked-glass display shelf in a dark boutique, a soft spotlight from above',
      motion: 'slow camera push-in, the jewellery sharp, glints travelling across the metal',
    },
    {
      scene: 'on a dark glossy stone beside still water reflecting golden light, mysterious and rich',
      motion: 'slow dolly across the stone, soft ripples catching the light behind',
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
      motion: 'slow sideways camera dolly, a soft breeze moving the pampas',
    },
    {
      scene: 'on a pale linen jewellery bust in soft window light against a clean neutral background',
      motion: 'very slow camera push-in, daylight shifting softly',
    },
    {
      scene: 'on a beige ceramic dish beside a sprig of eucalyptus, clean composition',
      motion: 'smooth push-in, light glinting softly',
    },
    {
      scene: 'resting on a seamless warm-white surface with a soft shadow beneath it',
      motion: 'very slow camera push-in, minimal and elegant',
    },
  ],
};

export function buildPromptWriterSystem(): string {
  return (
    'You write shot lists for short vertical jewellery advertisement videos (Instagram Reels). ' +
    `Reply with ONLY a JSON array of exactly ${CAMPAIGN_SCENES} objects, each {"scene": string, "motion": string}. ` +
    '"scene" describes where and how the jewellery is staged (setting, props, background, lighting) in under 30 words; ' +
    'do not alter the jewellery. No scene shows a person, model, face, hand or any body part: every scene shows the ' +
    'jewellery alone, resting on a real surface or display (a plinth, bust, stand, tray, open box, fabric, stone or ' +
    'wood), never worn and never floating in the air. ' +
    'Do not add text or logos. "motion" is one slow camera movement (push-in, sideways dolly, tilt or crane) in under 20 ' +
    'words, plus at most gentle ambient movement (light, smoke, petals, fabric). The jewellery itself stays still: never ' +
    'rotate, spin, orbit, lift or handle it. ' +
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
    .filter((p) => p.scene.length >= 12 && p.motion.length >= 6 && !hasPeople(`${p.scene} ${p.motion}`))
    .slice(0, CAMPAIGN_SCENES);
  const scenes = [...fromModel, ...FALLBACK[style].slice(fromModel.length)].slice(0, CAMPAIGN_SCENES);
  return { scenes, fromModel: fromModel.length };
}

export function fallbackScene(style: MarketingStyle, index: number): ScenePrompt {
  return FALLBACK[style][index % FALLBACK[style].length];
}

/** A person or body part in a scene direction (marketing shows the jewellery only). "Hand-carved" is no hand. */
const PEOPLE_IN_SCENE =
  /\b(models?|person|people|wom[ae]n|m[ae]n|lady|ladies|bride|groom|girls?|boys?|couple|wearing|worn|wears|hands|fingers?|wrists?|palms?|faces?)\b/i;

export function hasPeople(text: string | null | undefined): boolean {
  return PEOPLE_IN_SCENE.test(text ?? '');
}

/**
 * The scene a campaign renders at this position: its own, or — when it shows a person (campaigns planned before
 * marketing became jewellery-only had one model scene) — the jewellery-only scene of its style in its place.
 */
export function productOnlyScene(scene: ScenePrompt, style: MarketingStyle, index: number): ScenePrompt {
  return hasPeople(`${scene.scene} ${scene.motion}`) ? fallbackScene(style, index) : scene;
}

/** Image-to-image prompt: restage the exact product. */
export function buildSceneImagePrompt(scene: string, title: string): string {
  // Marketing shows the jewellery only. The image is animated afterwards: a small piece gets few pixels at video
  // resolution and its detail melts, so it fills most of the frame.
  const people = 'No people or hands.';
  const framing = 'Product centred, fully visible and filling most of the frame,';
  return (
    `Professional vertical product photograph for a jewellery advertisement. Place the exact jewellery piece from the ` +
    `reference image (${title}) ${scene}. Keep the jewellery identical: same design, shape, metal colour (silver stays ` +
    `silver, gold stays gold), enamel colours, stones and fine details; do not add, remove or redesign any part. ${framing} sharp focus, photorealistic, ` +
    `high detail, ${people} No text or watermark.`
  );
}

/** Motion that moves the jewellery or a body part — what warps the piece and pulls extra hands into the clip. */
const RISKY_MOTION =
  /rotat|orbit|spin|turntable|twirl|\bturns?\b|turning|lift|pick|hold(?:s|ing)? (?:it|the)|touch|gestur|wave|reach|hand|finger|wrist|raises?/i;

/** Safe camera moves, picked by a stable hash so a scene keeps the same move between renders. */
const CAMERA_MOVES = [
  'very slow camera push-in towards the jewellery',
  'slow sideways camera dolly past the jewellery',
  'slow camera tilt down onto the jewellery',
  'slow gentle camera crane down to the jewellery',
];

/**
 * The scene's motion, made safe for Wan: the camera moves, the jewellery stays still. A motion that rotates or handles
 * the piece, or moves a hand, is replaced by a slow camera move (a model just holds still and breathes).
 */
export function safeMotion(motion: string, withModel: boolean): string {
  const text = (motion || '').trim();
  if (text && !RISKY_MOTION.test(text)) return text;
  const hash = [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const move = CAMERA_MOVES[hash % CAMERA_MOVES.length];
  return withModel ? `the model holds still with a soft natural breath and blink, ${move}` : move;
}

/**
 * Video prompt for a scene clip (Wan 2.2 I2V A14B + LightX2V at CFG 1, where a negative prompt has no effect): it
 * describes only the camera and the light — naming "hands" or "people", even as "no hands", pulls them in. The
 * first and last keyframes (crops of the still) fix the actual camera move. VIDEO_NEGATIVE is kept for CFG > 1.
 */
export function buildSceneVideoPrompt(motion: string, scene = ''): string {
  const withModel = /\b(model|person|woman|man|female|male|wearing|worn)\b/i.test(`${scene} ${motion}`);
  const subject = withModel
    ? 'The model stays still and relaxed, wearing the jewellery exactly as in the first frame; same face, outfit and pose.'
    : 'The jewellery rests perfectly still in its setting; only the camera and the light move.';
  return (
    `Photorealistic 5-second vertical luxury jewellery commercial shot that continues the opening image exactly. ` +
    `${subject} CAMERA: ${safeMotion(motion, withModel)}, smooth and steady, easing in and out, ending calm. ` +
    `The jewellery stays identical in every frame — same silhouette, proportions, metal colour, enamel colours and ` +
    `every detail in its place — sharp, fully in frame and prominent from start to finish. ` +
    `LIGHT: soft premium lighting, gentle highlights travelling slowly across the polished metal, ` +
    `steady focus, consistent exposure and background, one continuous shot.`
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
  'extra hands, extra fingers, deformed hands, hand entering the frame, fingers touching the jewellery, reaching hand, person entering the frame, ' +
  'rotating jewellery, spinning, extra bangles, extra rings, extra people, duplicate jewellery, extra objects, abrupt cuts, camera shake, ' +
  'extreme close-up, cropped product, motion blur, text, subtitles, watermark, static frame, overexposed, oversaturated, jpeg artifacts';
