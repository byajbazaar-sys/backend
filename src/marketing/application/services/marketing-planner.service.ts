import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { MarketingBrand, MarketingCampaign, MarketingScene } from '../domain';
import { CAMPAIGN_SCENES, EAssetStatus, ECampaignStatus, MarketingStyle } from '../enums';
import {
  IMarketingAi,
  IMarketingBrandsRepository,
  IMarketingCampaignsRepository,
  IMarketingCatalog,
  IMarketingFileStorage,
  IMarketingScenesRepository,
  MARKETING_AI,
  MARKETING_BRANDS_REPOSITORY,
  MARKETING_CAMPAIGNS_REPOSITORY,
  MARKETING_CATALOG,
  MARKETING_FILE_STORAGE,
  MARKETING_SCENES_REPOSITORY,
} from '../ports';
import { MarketingEvents } from './marketing-events';
import { MarketingKeys } from './marketing-keys';
import { MarketingRenderService } from './marketing-render.service';
import {
  buildLogoImagePrompt,
  buildPromptWriterSystem,
  buildPromptWriterUser,
  buildSceneImagePrompt,
  fallbackScene,
  parseScenePrompts,
} from '../prompts/marketing.prompts';

const SCENE_SIZE = { width: 720, height: 1280 };
const LOGO_SIZE = { width: 720, height: 1280 };
/** Scene images generated at once (Cloudflare). */
const IMAGE_CONCURRENCY = 2;

/** Cloudflare steps: prompts (cheap text model), scene images (image-to-image) and the brand logo (text-to-image). */
@Injectable()
export class MarketingPlannerService {
  constructor(
    @Inject(MARKETING_CAMPAIGNS_REPOSITORY) private readonly campaigns: IMarketingCampaignsRepository,
    @Inject(MARKETING_SCENES_REPOSITORY) private readonly scenes: IMarketingScenesRepository,
    @Inject(MARKETING_BRANDS_REPOSITORY) private readonly brands: IMarketingBrandsRepository,
    @Inject(MARKETING_FILE_STORAGE) private readonly storage: IMarketingFileStorage,
    @Inject(MARKETING_CATALOG) private readonly catalog: IMarketingCatalog,
    @Inject(MARKETING_AI) private readonly ai: IMarketingAi,
    private readonly render: MarketingRenderService,
    private readonly events: MarketingEvents,
    @InjectPinoLogger(MarketingPlannerService.name) private readonly logger: PinoLogger,
  ) {}

  /** plan step: brand logo (if missing) → 5 prompts → 5 scene images → queue the Kaggle render. */
  async plan(campaignId: string): Promise<void> {
    const campaign = await this.campaigns.findById(campaignId);
    if (campaign?.status !== ECampaignStatus.Planning) return;
    try {
      await this.ensureLogo(campaign.userId);

      let scenes = await this.scenes.listForCampaign(campaign.id);
      if (!scenes.length) {
        await this.update(campaign, 4, 'Writing scene ideas');
        scenes = await this.scenes.createMany(
          (await this.writePrompts(campaign)).map((p, index) => ({
            campaignId: campaign.id,
            index,
            imagePrompt: p.scene,
            motionPrompt: p.motion,
            imageStatus: EAssetStatus.Pending,
            videoStatus: EAssetStatus.Pending,
          })),
        );
      }

      await this.update(campaign, 8, 'Designing 5 scenes');
      const source = await this.storage.readAsync(campaign.sourceImageKey);
      let done = 0;
      const pending = scenes.filter((s) => s.imageStatus !== EAssetStatus.Ready);
      for (let i = 0; i < pending.length; i += IMAGE_CONCURRENCY) {
        await Promise.all(
          pending.slice(i, i + IMAGE_CONCURRENCY).map(async (scene) => {
            await this.generateSceneImage(campaign, scene, source);
            done += 1;
            await this.update(
              campaign,
              8 + Math.round((22 * done) / pending.length),
              `Designing scenes (${done}/${pending.length})`,
              true,
            );
          }),
        );
      }

      const ready = (await this.scenes.listForCampaign(campaign.id)).filter(
        (s) => s.imageStatus === EAssetStatus.Ready,
      );
      if (!ready.length) throw new Error('None of the scene images could be generated');
      await this.render.queueCampaignRender(campaign.id);
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
    const source = await this.storage.readAsync(campaign.sourceImageKey);
    const ok = await this.generateSceneImage(campaign, scene, source);
    if (ok && renderVideo) {
      await this.render.queueCampaignRender(campaignId, [index]);
      return;
    }
    // Nothing queued: settle the campaign back from "waiting" so it doesn't look stuck.
    const settled = await this.campaigns.update(campaignId, {
      status: campaign.mergedVideoKey ? ECampaignStatus.Partial : ECampaignStatus.Failed,
      stageMessage: ok ? 'Scene image updated' : 'Scene image failed — try again',
    });
    if (settled) await this.events.campaign(settled, true);
  }

  /** logo step: (re)generate the logo image and/or queue the logo video. */
  async regenerateLogo(userId: string, target: 'image' | 'video' | 'both'): Promise<void> {
    if (target === 'image' || target === 'both') {
      const brand = await this.brandFor(userId);
      await this.generateLogoImage(brand);
    }
    if (target === 'video' || target === 'both') await this.render.queueLogoRender(userId);
  }

  // ---------------------------------------------------------------- helpers

  private async writePrompts(campaign: MarketingCampaign) {
    const item =
      campaign.sourceType === 'inventory' && campaign.inventoryItemId
        ? await this.catalog.findItem(campaign.userId, campaign.inventoryItemId).catch(() => null)
        : null;
    const ctx = {
      title: campaign.title,
      style: campaign.style as MarketingStyle,
      businessName: await this.catalog.businessName(campaign.userId).catch(() => null),
      metalType: item?.metalType,
      purity: item?.purity,
      categoryName: item?.categoryName,
    };
    try {
      const reply = await this.ai.generateText(buildPromptWriterSystem(), buildPromptWriterUser(ctx), {
        maxTokens: 900,
        temperature: 0.85,
      });
      const { scenes, fromModel } = parseScenePrompts(reply, ctx.style);
      this.logger.info({ campaignId: campaign.id, fromModel }, 'Scene prompts written');
      return scenes;
    } catch (err) {
      this.logger.warn(
        { err: (err as Error).message, campaignId: campaign.id },
        'Prompt model failed — using curated scenes',
      );
      return Array.from({ length: CAMPAIGN_SCENES }, (_, i) => fallbackScene(ctx.style, i));
    }
  }

  private async generateSceneImage(
    campaign: MarketingCampaign,
    scene: MarketingScene,
    source: Buffer,
  ): Promise<boolean> {
    await this.scenes.update(scene.id, { imageStatus: EAssetStatus.Generating, error: null });
    try {
      const image = await this.ai.imageToImage(
        { base64: source.toString('base64'), mimeType: 'image/png' },
        buildSceneImagePrompt(scene.imagePrompt, campaign.title),
        SCENE_SIZE,
      );
      const key = MarketingKeys.sceneImage(campaign.userId, campaign.id, scene.index);
      await this.storage.writeAsync(key, Buffer.from(image.base64, 'base64'), image.mimeType || 'image/png');
      if (scene.imageKey && scene.imageKey !== key) await this.storage.removeAsync(scene.imageKey).catch(() => false);
      await this.scenes.update(scene.id, { imageKey: key, imageStatus: EAssetStatus.Ready });
      return true;
    } catch (err) {
      this.logger.warn(
        { err: (err as Error).message, campaignId: campaign.id, scene: scene.index },
        'Scene image failed',
      );
      await this.scenes.update(scene.id, {
        imageStatus: EAssetStatus.Failed,
        error: `Image: ${(err as Error).message}`.slice(0, 500),
      });
      return false;
    }
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
    if (brand.logoImageStatus === EAssetStatus.Ready && brand.logoImageKey) return;
    await this.generateLogoImage(brand);
  }

  private async generateLogoImage(brand: MarketingBrand): Promise<void> {
    await this.brands.upsert({ userId: brand.userId, logoImageStatus: EAssetStatus.Generating, error: null });
    await this.events.brand(brand.userId);
    try {
      const image = await this.ai.textToImage(buildLogoImagePrompt(brand.businessName), LOGO_SIZE);
      const key = MarketingKeys.logoImage(brand.userId);
      await this.storage.writeAsync(key, Buffer.from(image.base64, 'base64'), image.mimeType || 'image/png');
      if (brand.logoImageKey && brand.logoImageKey !== key)
        await this.storage.removeAsync(brand.logoImageKey).catch(() => false);
      // A new logo image makes the old logo video stale: it is re-rendered with the next campaign (or on request).
      await this.brands.upsert({
        userId: brand.userId,
        logoImageKey: key,
        logoImageStatus: EAssetStatus.Ready,
        logoVideoStatus: brand.logoVideoKey ? EAssetStatus.Pending : brand.logoVideoStatus,
      });
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
