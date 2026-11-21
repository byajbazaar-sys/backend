import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { BrandView } from './brand-view';
import { CampaignView } from './campaign-view';
import { CreateCampaignInput } from './create-campaign-input';
import {
  MarketingBrand,
  MarketingCampaign,
  RenderJob,
  BUSY_RENDER_STATUSES,
  CAMPAIGN_SCENES,
  EAssetStatus,
  ECampaignStatus,
  ERenderJobKind,
  MARKETING_QUALITIES,
  MARKETING_STYLES,
  MarketingQuality,
  MarketingVideoEngine,
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
  IRenderJobsRepository,
  RENDER_JOBS_REPOSITORY,
  IMarketingScheduledPostsRepository,
  MARKETING_SCHEDULED_POSTS_REPOSITORY,
  MarketingEvents,
  MarketingScheduler,
  MarketingKeys,
  resolveImageMode,
  productMaskKey,
} from '../../../shared';
import { MarketingBrandingService } from '../../branding/marketing-branding.service';
import { MarketingRenderService, kaggleBatchStatus } from '../../kaggle';

const MAX_ACTIVE_PER_USER = 2;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

@Injectable()
export class MarketingCampaignsService {
  constructor(
    @Inject(MARKETING_CAMPAIGNS_REPOSITORY) private readonly campaigns: IMarketingCampaignsRepository,
    @Inject(MARKETING_SCENES_REPOSITORY) private readonly scenes: IMarketingScenesRepository,
    @Inject(MARKETING_BRANDS_REPOSITORY) private readonly brands: IMarketingBrandsRepository,
    @Inject(RENDER_JOBS_REPOSITORY) private readonly jobs: IRenderJobsRepository,
    @Inject(MARKETING_SCHEDULED_POSTS_REPOSITORY) private readonly scheduledPosts: IMarketingScheduledPostsRepository,
    @Inject(MARKETING_FILE_STORAGE) private readonly storage: IMarketingFileStorage,
    @Inject(MARKETING_CATALOG) private readonly catalog: IMarketingCatalog,
    private readonly render: MarketingRenderService,
    private readonly scheduler: MarketingScheduler,
    private readonly events: MarketingEvents,
    private readonly branding: MarketingBrandingService,
    @InjectPinoLogger(MarketingCampaignsService.name) private readonly logger: PinoLogger,
  ) {}

  // ---------------------------------------------------------------- campaigns

  async create(userId: string, input: CreateCampaignInput): Promise<CampaignView> {
    const style = (MARKETING_STYLES as readonly string[]).includes(input.style ?? '')
      ? (input.style as MarketingStyle)
      : 'studio';
    const quality = (MARKETING_QUALITIES as readonly string[]).includes(input.quality ?? '')
      ? (input.quality as MarketingQuality)
      : 'hd';
    const imageMode = resolveImageMode(input.imageMode);
    const videoEngine: MarketingVideoEngine = input.videoEngine === 'fast' ? 'fast' : 'detailed';
    if (!input.inventoryItemId && !input.image?.base64) {
      throw new BadRequestException('Choose an inventory item or upload a photo.');
    }
    // if ((await this.campaigns.countActiveForUser(userId)) >= MAX_ACTIVE_PER_USER) {
    //   throw new BadRequestException(
    //     `You can have ${MAX_ACTIVE_PER_USER} campaigns in progress at a time. Try again when one finishes.`,
    //   );
    // }

    // Resolve the input image first, so nothing is created for a bad input.
    let image: { data: Buffer; ext: string };
    let title: string;
    let inventoryItemId: string | null = null;
    if (input.inventoryItemId) {
      const item = await this.catalog.findItem(userId, input.inventoryItemId);
      if (!item) throw new NotFoundException('Inventory item not found');
      if (!item.imageKey)
        throw new BadRequestException('This item has no photo yet. Add one or upload a photo instead.');
      const data = await this.catalog.readImage(item.imageKey);
      if (!data?.length)
        throw new BadRequestException("This item's photo could not be loaded. Re-upload it or upload a photo instead.");
      image = { data, ext: 'png' }; // the storage corrects the extension to the real image type
      title = input.title?.trim() || item.itemName;
      inventoryItemId = item.id;
    } else {
      const ext = UPLOAD_TYPES[input.image.mimeType];
      if (!ext) throw new BadRequestException('Upload a JPG, PNG or WEBP photo.');
      const data = Buffer.from(input.image.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (!data.length || data.length > MAX_UPLOAD_BYTES)
        throw new BadRequestException('The photo must be under 8 MB.');
      image = { data, ext };
      title = input.title?.trim() || 'Jewellery';
    }

    const campaign = await this.campaigns.create({
      userId,
      title: title.slice(0, 255),
      sourceType: inventoryItemId ? 'inventory' : 'upload',
      inventoryItemId,
      sourceImageKey: '',
      style,
      quality,
      imageMode,
      videoEngine,
      status: ECampaignStatus.Planning,
      progress: 1,
      stageMessage: 'Queued',
    });
    let sourceImageKey: string;
    try {
      // writeAsync stores under the real image type's extension (an inventory JPEG becomes source.jpg) and returns
      // that key — record it, or the photo can't be read back later.
      sourceImageKey = await this.storage.writeAsync(
        MarketingKeys.source(userId, campaign.id, image.ext),
        image.data,
        `image/${image.ext === 'jpg' ? 'jpeg' : image.ext}`,
      );
    } catch (err) {
      await this.campaigns.delete(campaign.id);
      throw err;
    }
    const saved = await this.campaigns.update(campaign.id, { sourceImageKey });
    await this.events.campaign(saved, true);
    await this.scheduler.schedule({ step: 'plan', campaignId: campaign.id });
    return this.view(saved, false);
  }

  async list(userId: string): Promise<CampaignView[]> {
    const campaigns = await this.campaigns.listForUser(userId, 30);
    const jobs = await this.jobs.latestForCampaigns(campaigns.map((c) => c.id));
    return Promise.all(
      campaigns.map((c) =>
        this.view(
          c,
          false,
          jobs.filter((j) => j.campaignId === c.id),
        ),
      ),
    );
  }

  async get(userId: string, id: string): Promise<CampaignView> {
    const campaign = await this.owned(userId, id);
    return this.view(campaign, true, await this.jobs.latestForCampaigns([campaign.id]));
  }

  async remove(userId: string, id: string): Promise<void> {
    const campaign = await this.owned(userId, id);
    if (await this.scheduledPosts.hasOpenForSource(userId, 'campaign', id)) {
      throw new ConflictException('Cancel this campaign’s scheduled Instagram posts before deleting it.');
    }
    const open = await this.jobs.listOpenFor({ campaignId: id });
    if (open.some((job) => BUSY_RENDER_STATUSES.includes(job.status))) {
      throw new ConflictException('This campaign is rendering right now. Delete it once it finishes.');
    }
    const scenes = await this.scenes.listForCampaign(id);
    const keys = [
      campaign.sourceImageKey,
      campaign.mergedVideoKey,
      ...scenes.flatMap((s) => [s.imageKey, s.imageKey && productMaskKey(s.imageKey), s.videoKey]),
    ].filter((k): k is string => !!k);
    await Promise.all(keys.map((k) => this.storage.removeAsync(k).catch(() => false)));
    await this.campaigns.delete(id); // scenes and render jobs cascade
  }

  /**
   * Regenerate one scene: `image` = new Kaggle-generated scene image then a new video; `video` = new video from the
   * current image. Both re-merge the film.
   */
  async regenerateScene(userId: string, id: string, index: number, target: 'image' | 'video'): Promise<CampaignView> {
    const campaign = await this.owned(userId, id);
    if (await this.scheduledPosts.hasOpenForSource(userId, 'campaign', id)) {
      throw new ConflictException('Cancel this campaign’s scheduled Instagram posts before regenerating its media.');
    }
    if (!Number.isInteger(index) || index < 0 || index >= CAMPAIGN_SCENES)
      throw new BadRequestException('Unknown scene');
    if (campaign.status === ECampaignStatus.Planning)
      throw new ConflictException('The scenes are still being prepared.');
    const scene = await this.scenes.findByIndex(id, index);
    if (!scene) throw new NotFoundException('Scene not found');
    const videoJobs = await this.jobs.listOpenFor({ campaignId: id, kind: ERenderJobKind.Campaign });
    if (videoJobs.some((job) => BUSY_RENDER_STATUSES.includes(job.status))) {
      throw new ConflictException('This campaign is rendering right now. Try again when it finishes.');
    }
    const imageJob = await this.jobs.findOpenFor({ campaignId: id, kind: ERenderJobKind.Images });
    if (imageJob) {
      throw new ConflictException('This campaign is generating images right now. Try again when it finishes.');
    }

    if (target === 'image') {
      await this.scenes.update(scene.id, { imageStatus: EAssetStatus.Generating, videoStatus: EAssetStatus.Pending });
      await this.scheduler.schedule({ step: 'image', campaignId: id, sceneIndex: index, render: true });
    } else {
      if (scene.imageStatus !== EAssetStatus.Ready) throw new BadRequestException('Regenerate the image first.');
      const queued = await this.render.queueCampaignRender(id, [index]);
      if (!queued) throw new ConflictException('Could not queue the video. Try again in a moment.');
    }
    const updated = await this.campaigns.update(id, { status: ECampaignStatus.WaitingGpu, completedAt: null });
    await this.events.campaign(updated, true);
    return this.view(updated, true, await this.jobs.latestForCampaigns([updated.id]));
  }

  // ---------------------------------------------------------------- brand kit

  async brand(userId: string): Promise<BrandView> {
    let brand = await this.brands.find(userId);
    if (!brand) {
      brand = await this.brands.upsert({
        userId,
        businessName: (await this.catalog.businessName(userId).catch(() => null))?.trim() || 'Jewellers',
        logoImageStatus: EAssetStatus.Pending,
        logoVideoStatus: EAssetStatus.Pending,
      });
    }
    return this.brandView(brand);
  }

  /** The owner's brand-kit switches (logo on exported photos). */
  async updateBrandSettings(userId: string, settings: { logoOverlay: boolean }): Promise<BrandView> {
    await this.brand(userId);
    await this.brands.upsert({ userId, logoOverlay: settings.logoOverlay });
    return this.brand(userId);
  }

  async regenerateBrand(userId: string, target: 'image' | 'video' | 'both'): Promise<BrandView> {
    const brand = await this.brand(userId);
    if (target !== 'image' && (await this.jobs.findOpenFor({ userId, kind: ERenderJobKind.Logo }))) {
      throw new ConflictException('The logo video is already being made.');
    }
    if (target === 'video' && brand.logoImageStatus !== EAssetStatus.Ready) {
      throw new BadRequestException('Create the logo first.');
    }
    if (target !== 'video') await this.brands.upsert({ userId, logoImageStatus: EAssetStatus.Generating });
    await this.scheduler.schedule({ step: 'logo', userId, target });
    return this.brand(userId);
  }

  // ---------------------------------------------------------------- views

  private async owned(userId: string, id: string): Promise<MarketingCampaign> {
    const campaign = await this.campaigns.findForUser(id, userId);
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  private url(key?: string | null): Promise<string | undefined> {
    return key
      ? this.storage
          .getUrlAsync(key)
          .then((u) => u ?? undefined)
          .catch(() => undefined)
      : Promise.resolve(undefined);
  }

  private async view(campaign: MarketingCampaign, withScenes: boolean, jobs?: RenderJob[]): Promise<CampaignView> {
    const scenes = await this.scenes.listForCampaign(campaign.id);
    const cover = scenes.find((s) => s.imageStatus === EAssetStatus.Ready && s.imageKey);
    const [sourceImageUrl, mergedVideoUrl, coverImageUrl] = await Promise.all([
      this.url(campaign.sourceImageKey),
      this.url(campaign.mergedVideoKey),
      this.url(cover?.imageKey),
    ]);
    const view: CampaignView = {
      ...campaign,
      sourceImageUrl,
      mergedVideoUrl,
      coverImageUrl,
      coverSceneIndex: cover?.index,
    };
    // One status per notebook, even when its scenes run as parallel jobs on several accounts.
    const imageJob = kaggleBatchStatus(jobs?.filter((j) => j.kind === ERenderJobKind.Images) ?? []);
    const videoJob = kaggleBatchStatus(jobs?.filter((j) => j.kind === ERenderJobKind.Campaign) ?? []);
    if (imageJob) view.imageJob = imageJob;
    if (videoJob) view.videoJob = videoJob;
    if (withScenes) {
      view.scenes = await Promise.all(
        scenes.map(async (s) => ({
          ...s,
          imageUrl: s.imageStatus === EAssetStatus.Ready ? await this.url(s.imageKey) : undefined,
          videoUrl: s.videoStatus === EAssetStatus.Ready ? await this.url(s.videoKey) : undefined,
        })),
      );
    }
    return view;
  }

  private async brandView(brand: MarketingBrand): Promise<BrandView> {
    const [logoImageUrl, logoVideoUrl, overlay, preview] = await Promise.all([
      brand.logoImageStatus === EAssetStatus.Ready ? this.url(brand.logoImageKey) : undefined,
      brand.logoVideoStatus === EAssetStatus.Ready ? this.url(brand.logoVideoKey) : undefined,
      this.branding.logoView(brand.userId).catch(() => null),
      this.branding.preview(brand.userId).catch(() => null),
    ]);
    return {
      ...brand,
      logoImageUrl,
      logoVideoUrl,
      logoOverlay: brand.logoOverlay !== false,
      overlayLogoUrl: overlay?.url,
      overlayLogoSource: overlay?.source,
      overlayLogoPreview: preview?.dataUrl,
      overlayLogoCard: preview?.card,
    };
  }

  capacity(): ReturnType<MarketingRenderService['capacity']> {
    return this.render.capacity();
  }
}
