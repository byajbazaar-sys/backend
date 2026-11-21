import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';

import {
  EAssetStatus,
  IMarketingBrandsRepository,
  IMarketingCatalog,
  IMarketingFileStorage,
  MARKETING_BRANDS_REPOSITORY,
  MARKETING_CATALOG,
  MARKETING_FILE_STORAGE,
  overlayLogo,
  prepareLogo,
} from '../../shared';

export type LogoSource = 'profile' | 'generated';

/** Prepared logos per stored file (a warm Lambda reuses them); short-lived so a re-uploaded logo shows up soon. */
const PREPARED = new Map<string, { logo: Buffer; at: number }>();
const PREPARED_TTL_MS = 10 * 60_000;
const PREPARED_MAX = 50;

/**
 * The shop logo on exported photos (Instagram posts, downloads), top-left. The logo the owner uploaded in their
 * profile wins; without one, the brand kit's generated logo is used. Stored media is never changed — scene images
 * also feed the video renders, which must stay clean.
 */
@Injectable()
export class MarketingBrandingService {
  constructor(
    @Inject(MARKETING_CATALOG) private readonly catalog: IMarketingCatalog,
    @Inject(MARKETING_BRANDS_REPOSITORY) private readonly brands: IMarketingBrandsRepository,
    @Inject(MARKETING_FILE_STORAGE) private readonly storage: IMarketingFileStorage,
    @InjectPinoLogger(MarketingBrandingService.name) private readonly logger: PinoLogger,
  ) {}

  /** The logos that could be used, best first. */
  private async candidates(userId: string): Promise<{ source: LogoSource; ref: string }[]> {
    const [profile, brand] = await Promise.all([
      this.catalog.shopLogoRef(userId).catch(() => null),
      this.brands.find(userId),
    ]);
    const list: { source: LogoSource; ref: string }[] = [];
    if (profile) list.push({ source: 'profile', ref: profile });
    if (brand?.logoImageKey && brand.logoImageStatus === EAssetStatus.Ready) {
      list.push({ source: 'generated', ref: brand.logoImageKey });
    }
    return list;
  }

  /** Whether photos get the logo by default (the owner's switch; on unless turned off). */
  async enabled(userId: string): Promise<boolean> {
    return (await this.brands.find(userId))?.logoOverlay !== false;
  }

  /** The logo that will be used, with a viewable URL (for the preview), or null when the shop has none. */
  async logoView(userId: string): Promise<{ source: LogoSource; url: string } | null> {
    for (const candidate of await this.candidates(userId)) {
      try {
        const url =
          candidate.source === 'profile'
            ? await this.catalog.imageUrl(candidate.ref)
            : await this.storage.getUrlAsync(candidate.ref);
        if (url) return { source: candidate.source, url };
      } catch (err) {
        this.logger.warn({ userId, source: candidate.source, err: (err as Error).message }, 'Logo URL unavailable');
      }
    }
    return null;
  }

  /**
   * The prepared logo as a small PNG data URL (exactly what goes on photos, margins trimmed) and whether it sits on a
   * light card (logos with transparency) — for the web preview.
   */
  async preview(userId: string): Promise<{ dataUrl: string; card: boolean } | null> {
    const logo = await this.preparedLogo(userId);
    if (!logo) return null;
    const small = await sharp(logo)
      .resize({ height: 160, width: 400, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const card = !(await sharp(logo).stats()).isOpaque;
    return { dataUrl: `data:image/png;base64,${small.toString('base64')}`, card };
  }

  /**
   * The photo with the logo when it applies: `withLogo` overrides the owner's switch (a post's own setting). Returns
   * the photo unchanged when it is off or the shop has no usable logo.
   */
  async apply(userId: string, image: Buffer, withLogo?: boolean): Promise<{ image: Buffer; branded: boolean }> {
    if (!(withLogo ?? (await this.enabled(userId)))) return { image, branded: false };
    const logo = await this.preparedLogo(userId);
    if (!logo) return { image, branded: false };
    return { image: await overlayLogo(image, logo), branded: true };
  }

  private async preparedLogo(userId: string): Promise<Buffer | null> {
    for (const candidate of await this.candidates(userId)) {
      const key = `${candidate.source}:${candidate.ref}`;
      const cached = PREPARED.get(key);
      if (cached && Date.now() - cached.at < PREPARED_TTL_MS) return cached.logo;
      try {
        const raw =
          candidate.source === 'profile'
            ? await this.catalog.readImage(candidate.ref)
            : await this.storage.readAsync(candidate.ref);
        const logo = await prepareLogo(raw);
        if (PREPARED.size >= PREPARED_MAX) PREPARED.delete(PREPARED.keys().next().value as string);
        PREPARED.set(key, { logo, at: Date.now() });
        return logo;
      } catch (err) {
        // An unreadable profile logo falls back to the generated one.
        this.logger.warn({ userId, source: candidate.source, err: (err as Error).message }, 'Could not read the logo');
      }
    }
    return null;
  }
}
