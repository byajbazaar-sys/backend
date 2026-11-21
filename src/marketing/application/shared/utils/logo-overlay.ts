import sharp from 'sharp';

/** Badge size and place, as fractions of the photo: the same numbers drive the web preview. */
export const LOGO_OVERLAY = {
  /** Badge height, of the photo's shorter side. */
  heightRatio: 0.13,
  /** Widest a (wide) logo may get, of the photo's width. */
  maxWidthRatio: 0.32,
  /** Gap from the top and left edges, of the photo's shorter side. */
  marginRatio: 0.035,
} as const;

/**
 * Ready-to-place logo: upright, with plain margins trimmed (e.g. the generated logo's empty black backdrop) so the
 * mark fills its badge. Returns PNG.
 */
export async function prepareLogo(logo: Buffer): Promise<Buffer> {
  const upright = await sharp(logo).rotate().png().toBuffer();
  let trimmed: { data: Buffer; info: sharp.OutputInfo };
  try {
    trimmed = await sharp(upright).trim({ threshold: 40 }).png().toBuffer({ resolveWithObject: true });
  } catch {
    return upright;
  }
  // A logo that is almost all margin would trim to a sliver: keep the original then.
  if (trimmed.info.width < 24 || trimmed.info.height < 24) return upright;
  if (!(await sharp(trimmed.data).stats()).isOpaque) return trimmed.data;
  // An opaque logo becomes the badge itself: give the mark a little room in its own background colour.
  // The backdrop colour: the untrimmed logo's corner pixel.
  const corner = await sharp(upright).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  const background = { r: corner[0] ?? 0, g: corner[1] ?? 0, b: corner[2] ?? 0, alpha: 1 };
  const room = Math.round(Math.max(trimmed.info.width, trimmed.info.height) * 0.1);
  return sharp(trimmed.data).extend({ top: room, bottom: room, left: room, right: room, background }).png().toBuffer();
}

const roundedRect = (
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke?: { color: string; width: number },
) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="${stroke ? stroke.width / 2 : 0}" y="${stroke ? stroke.width / 2 : 0}" ` +
      `width="${width - (stroke?.width ?? 0)}" height="${height - (stroke?.width ?? 0)}" rx="${radius}" ry="${radius}" ` +
      `fill="${fill}"${stroke ? ` stroke="${stroke.color}" stroke-width="${stroke.width}"` : ''}/></svg>`,
  );

/**
 * The photo with the shop logo on its top-left: a rounded badge with a soft shadow. A logo with transparency sits on
 * a light card (readable on any photo); an opaque logo is used as the badge itself, corners rounded.
 */
export async function overlayLogo(
  image: Buffer,
  preparedLogo: Buffer,
  format: 'jpeg' | 'png' = 'jpeg',
): Promise<Buffer> {
  const base = await sharp(image).rotate().toBuffer({ resolveWithObject: true });
  const { width, height } = base.info;
  const short = Math.min(width, height);
  const boxHeight = Math.max(24, Math.round(short * LOGO_OVERLAY.heightRatio));
  const boxMaxWidth = Math.max(24, Math.round(width * LOGO_OVERLAY.maxWidthRatio));
  const margin = Math.round(short * LOGO_OVERLAY.marginRatio);

  const logoMeta = await sharp(preparedLogo).metadata();
  const transparent = !!logoMeta.hasAlpha && !(await sharp(preparedLogo).stats()).isOpaque;
  const pad = transparent ? Math.round(boxHeight * 0.14) : 0;

  const resized = await sharp(preparedLogo)
    .resize({ width: boxMaxWidth - 2 * pad, height: boxHeight - 2 * pad, fit: 'inside' })
    .png()
    .toBuffer({ resolveWithObject: true });
  const badgeWidth = resized.info.width + 2 * pad;
  const badgeHeight = resized.info.height + 2 * pad;
  const radius = Math.round(Math.min(badgeWidth, badgeHeight) * 0.18);
  const ring = { color: 'rgba(255,255,255,0.45)', width: Math.max(1, Math.round(boxHeight * 0.02)) };

  const badge = transparent
    ? await sharp(roundedRect(badgeWidth, badgeHeight, radius, 'rgba(255,255,255,0.92)'))
        .composite([{ input: resized.data, left: pad, top: pad }])
        .png()
        .toBuffer()
    : await sharp(resized.data)
        .composite([
          { input: roundedRect(badgeWidth, badgeHeight, radius, '#fff'), blend: 'dest-in' },
          { input: roundedRect(badgeWidth, badgeHeight, radius, 'none', ring) },
        ])
        .png()
        .toBuffer();

  const blur = Math.max(2, Math.round(boxHeight * 0.08));
  const shadow = await sharp(roundedRect(badgeWidth + blur * 4, badgeHeight + blur * 4, radius, 'rgba(0,0,0,0)'))
    .composite([
      { input: roundedRect(badgeWidth, badgeHeight, radius, 'rgba(0,0,0,0.45)'), left: blur * 2, top: blur * 2 },
    ])
    .blur(blur)
    .png()
    .toBuffer();

  const composed = sharp(base.data).composite([
    { input: shadow, left: Math.max(0, margin - blur * 2), top: Math.max(0, margin - blur * 2 + Math.round(blur / 2)) },
    { input: badge, left: margin, top: margin },
  ]);
  return format === 'png' ? composed.png().toBuffer() : composed.jpeg({ quality: 92 }).toBuffer();
}
