import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  MarketingBrand,
  MarketingCampaign,
  CAMPAIGN_SCENES,
  EAssetStatus,
  ECampaignStatus,
  MarketingStyle,
  IMarketingBrandsRepository,
  MARKETING_BRANDS_REPOSITORY,
  IMarketingCampaignsRepository,
  MARKETING_CAMPAIGNS_REPOSITORY,
  IMarketingCatalog,
  MARKETING_CATALOG,
  IMarketingFileStorage,
  MARKETING_FILE_STORAGE,
  IMarketingScenesRepository,
  MARKETING_SCENES_REPOSITORY,
  MarketingEvents,
} from '../../../shared';
import { MarketingRenderService } from '../../kaggle';
import { fallbackScene } from '../utils';

/** All generated marketing images run on Kaggle; Cloudflare is not used by the marketing image pipeline. */
@Injectable()
export class MarketingPlannerService {
  constructor(
    @Inject(MARKETING_CAMPAIGNS_REPOSITORY) private readonly campaigns: IMarketingCampaignsRepository,
    @Inject(MARKETING_SCENES_REPOSITORY) private readonly scenes: IMarketingScenesRepository,
    @Inject(MARKETING_BRANDS_REPOSITORY) private readonly brands: IMarketingBrandsRepository,
    @Inject(MARKETING_FILE_STORAGE) private readonly storage: IMarketingFileStorage,
    @Inject(MARKETING_CATALOG) private readonly catalog: IMarketingCatalog,
    private readonly render: MarketingRenderService,
    private readonly events: MarketingEvents,
    @InjectPinoLogger(MarketingPlannerService.name) private readonly logger: PinoLogger,
  ) {}

  /** plan step: brand logo (if missing) → scene directions → queue Kaggle image analysis and generation. */
  async plan(campaignId: string): Promise<void> {
    const campaign = await this.campaigns.findById(campaignId);
    if (campaign?.status !== ECampaignStatus.Planning) return;
    try {
      await this.ensureLogo(campaign.userId);

      let scenes = await this.scenes.listForCampaign(campaign.id);
      if (!scenes.length) {
        await this.update(campaign, 4, 'Preparing scene directions');
        scenes = await this.scenes.createMany(
          Array.from({ length: CAMPAIGN_SCENES }, (_, index) =>
            fallbackScene(campaign.style as MarketingStyle, index),
          ).map((p, index) => ({
            campaignId: campaign.id,
            index,
            imagePrompt: p.scene,
            motionPrompt: p.motion,
            imageStatus: EAssetStatus.Pending,
            videoStatus: EAssetStatus.Pending,
          })),
        );
      }

      const pending = scenes.filter((s) => s.imageStatus !== EAssetStatus.Ready).map((s) => s.index);
      if (!pending.length) {
        await this.render.queueCampaignRender(campaign.id);
        return;
      }
      await this.update(campaign, 8, 'Queueing Qwen3-VL image analysis and SDXL scene generation');
      const job = await this.render.queueCampaignImages(campaign.id, pending, true);
      if (!job) throw new Error('The campaign images could not be queued');
    } catch (err) {
      this.logger.error({ err, campaignId }, 'Campaign planning failed');
      const failed = await this.campaigns.update(campaign.id, {
        status: ECampaignStatus.Failed,
        error: `Could not prepare the scenes: ${(err as Error).message}`.slice(0, 2000),
        stageMessage: 'Failed',
      });
      if (failed) await this.events.campaign(failed, true);
    }
  }

  /** image step: regenerate one scene image (new seed); optionally re-render its video afterwards. */
  async regenerateImage(campaignId: string, index: number, renderVideo: boolean): Promise<void> {
    const campaign = await this.campaigns.findById(campaignId);
    const scene = campaign ? await this.scenes.findByIndex(campaignId, index) : null;
    if (!campaign || !scene) return;
    await this.scenes.update(scene.id, { imageStatus: EAssetStatus.Generating, videoStatus: EAssetStatus.Pending });
    const job = await this.render.queueCampaignImages(campaignId, [index], renderVideo);
    if (!job) throw new Error('The scene image job could not be queued');
  }

  /** logo step: (re)generate the logo image and/or queue the logo video. */
  async regenerateLogo(userId: string, target: 'image' | 'video' | 'both'): Promise<void> {
    if (target === 'image' || target === 'both') {
      const brand = await this.brandFor(userId);
      await this.generateLogoImage(brand, target === 'both');
    }
    if (target === 'video') await this.render.queueLogoRender(userId);
  }

  // ---------------------------------------------------------------- helpers

  /**
   * The key an object is actually stored under. File storage replaces the extension with the detected image type, so
   * keys recorded by older versions (e.g. source.png for a JPEG photo) are found under their real extension.
   */
  private async findStored(key: string): Promise<string | null> {
    if (await this.storage.existsAsync(key)) return key;
    const base = key.replace(/\.[a-z0-9]+$/i, '');
    for (const ext of ['jpg', 'png', 'webp', 'jpeg']) {
      const candidate = `${base}.${ext}`;
      if (candidate !== key && (await this.storage.existsAsync(candidate))) return candidate;
    }
    return null;
  }

  private async brandFor(userId: string): Promise<MarketingBrand> {
    const existing = await this.brands.find(userId);
    const businessName =
      (await this.catalog.businessName(userId).catch(() => null))?.trim() || existing?.businessName || 'Jewellers';
    if (existing?.businessName === businessName) return existing;
    return this.brands.upsert({
      userId,
      businessName,
      logoImageStatus: existing?.logoImageStatus ?? EAssetStatus.Pending,
      logoVideoStatus: existing?.logoVideoStatus ?? EAssetStatus.Pending,
    });
  }

  /** Brand logo image, generated once per business and reused by every campaign. */
  private async ensureLogo(userId: string): Promise<void> {
    const brand = await this.brandFor(userId);
    if (brand.logoImageStatus === EAssetStatus.Ready && brand.logoImageKey) {
      // Older logos were recorded with a .png key while the file was stored as .jpg: repair the key.
      const stored = await this.findStored(brand.logoImageKey);
      if (stored === brand.logoImageKey) return;
      if (stored) {
        await this.brands.upsert({ userId, logoImageKey: stored });
        return;
      }
    }
    await this.generateLogoImage(brand);
  }

  private async generateLogoImage(brand: MarketingBrand, renderVideo = false): Promise<void> {
    await this.brands.upsert({ userId: brand.userId, logoImageStatus: EAssetStatus.Generating, error: null });
    await this.events.brand(brand.userId);
    try {
      const job = await this.render.queueLogoImage(brand.userId, brand.businessName, renderVideo);
      if (!job) throw new Error('Logo image generation could not be queued');
    } catch (err) {
      this.logger.warn({ err: (err as Error).message, userId: brand.userId }, 'Logo image failed');
      await this.brands.upsert({
        userId: brand.userId,
        logoImageStatus: EAssetStatus.Failed,
        error: (err as Error).message,
      });
    }
    await this.events.brand(brand.userId);
  }

  private async update(
    campaign: MarketingCampaign,
    progress: number,
    stageMessage: string,
    tick = false,
  ): Promise<void> {
    const updated = await this.campaigns.update(campaign.id, { progress, stageMessage });
    if (updated) await this.events.campaign(updated, !tick);
  }
}
