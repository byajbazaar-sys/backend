import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';

import { MarketingScheduledPost } from '../domain';
import { EAssetStatus } from '../enums';
import {
  IMarketingCampaignsRepository,
  IMarketingFileStorage,
  IMarketingPhotoshootShotsRepository,
  IMarketingPhotoshootsRepository,
  IMarketingScenesRepository,
  IMarketingScheduledPostsRepository,
  MARKETING_CAMPAIGNS_REPOSITORY,
  MARKETING_FILE_STORAGE,
  MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY,
  MARKETING_PHOTOSHOOTS_REPOSITORY,
  MARKETING_SCENES_REPOSITORY,
  MARKETING_SCHEDULED_POSTS_REPOSITORY,
} from '../ports';
import { MarketingInstagramService } from './marketing-instagram.service';

export interface ScheduleMarketingPostInput {
  sourceType: 'campaign' | 'photoshoot';
  sourceId: string;
  sourceIndex?: number;
  mediaType: 'IMAGE' | 'REEL';
  caption: string;
  scheduledAt: string;
}

@Injectable()
export class MarketingPublishingService {
  constructor(
    @Inject(MARKETING_SCHEDULED_POSTS_REPOSITORY) private readonly posts: IMarketingScheduledPostsRepository,
    @Inject(MARKETING_CAMPAIGNS_REPOSITORY) private readonly campaigns: IMarketingCampaignsRepository,
    @Inject(MARKETING_SCENES_REPOSITORY) private readonly scenes: IMarketingScenesRepository,
    @Inject(MARKETING_PHOTOSHOOTS_REPOSITORY) private readonly photoshoots: IMarketingPhotoshootsRepository,
    @Inject(MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY) private readonly shots: IMarketingPhotoshootShotsRepository,
    @Inject(MARKETING_FILE_STORAGE) private readonly storage: IMarketingFileStorage,
    private readonly instagram: MarketingInstagramService,
    @InjectPinoLogger(MarketingPublishingService.name) private readonly logger: PinoLogger,
  ) {}

  async list(userId: string): Promise<MarketingScheduledPost[]> {
    return this.posts.listForUser(userId, 200);
  }

  async schedule(userId: string, input: ScheduleMarketingPostInput): Promise<MarketingScheduledPost> {
    const scheduledAt = new Date(input.scheduledAt);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('Choose a time in the future.');
    }
    if (!(await this.instagram.status(userId)).connected) {
      throw new ConflictException('Connect your Instagram account before scheduling a post.');
    }

    const source = await this.resolveSource(userId, input);
    if (!(await this.storage.existsAsync(source.assetKey))) {
      throw new BadRequestException('The selected media is no longer available.');
    }

    return this.posts.create({
      userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceIndex: input.sourceIndex ?? null,
      sourceTitle: source.title,
      assetKey: source.assetKey,
      mediaType: input.mediaType,
      caption: input.caption.trim(),
      scheduledAt,
      status: 'SCHEDULED',
      instagramMediaId: null,
      error: null,
      publishedAt: null,
    });
  }

  async cancel(userId: string, id: string): Promise<void> {
    const post = await this.posts.findForUser(id, userId);
    if (!post) throw new NotFoundException('Scheduled post not found.');
    if (post.status !== 'SCHEDULED') throw new ConflictException('Only scheduled posts can be cancelled.');
    if (!(await this.posts.cancelForUser(id, userId))) {
      throw new ConflictException('This post has already started publishing.');
    }
  }

  async publishDuePosts(): Promise<{ claimed: number; published: number; failed: number }> {
    const due = await this.posts.claimDue(new Date(), 1);
    let published = 0;
    let failed = 0;
    for (const post of due) {
      let uploadKey: string | null = null;
      try {
        if (post.mediaType === 'IMAGE') {
          const normalized = await sharp(await this.storage.readAsync(post.assetKey))
            .resize(1080, 1350, { fit: 'cover', position: 'centre' })
            .jpeg({ quality: 90 })
            .toBuffer();
          uploadKey = await this.storage.writeAsync(
            `instagram/${post.userId}/scheduled-${post.id}.jpg`,
            normalized,
            'image/jpeg',
          );
        }
        const mediaUrl = await this.storage.getUrlAsync(uploadKey ?? post.assetKey);
        const mediaId = await this.instagram.publishMedia(post.userId, post.mediaType, mediaUrl, post.caption);
        await this.posts.update(post.id, {
          status: 'PUBLISHED',
          instagramMediaId: mediaId,
          publishedAt: new Date(),
          error: null,
        });
        published += 1;
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
        await this.posts.update(post.id, { status: 'FAILED', error: message });
        this.logger.error({ postId: post.id, userId: post.userId, err: message }, 'Instagram scheduled post failed');
        failed += 1;
      } finally {
        if (uploadKey) {
          try {
            if (!(await this.storage.removeAsync(uploadKey))) {
              this.logger.warn({ postId: post.id, uploadKey }, 'Could not remove temporary Instagram image');
            }
          } catch (error) {
            this.logger.warn(
              { postId: post.id, uploadKey, err: error instanceof Error ? error.message : String(error) },
              'Could not remove temporary Instagram image',
            );
          }
        }
      }
    }
    return { claimed: due.length, published, failed };
  }

  private async resolveSource(
    userId: string,
    input: ScheduleMarketingPostInput,
  ): Promise<{ assetKey: string; title: string }> {
    if (input.sourceType === 'campaign') {
      const campaign = await this.campaigns.findForUser(input.sourceId, userId);
      if (!campaign) throw new NotFoundException('Campaign not found.');
      if (input.mediaType === 'REEL') {
        if (!campaign.mergedVideoKey) throw new BadRequestException('This campaign does not have a finished reel yet.');
        return { assetKey: campaign.mergedVideoKey, title: campaign.title };
      }
      if (input.sourceIndex === undefined || input.sourceIndex < 0 || input.sourceIndex > 4) {
        throw new BadRequestException('Choose a finished campaign image.');
      }
      const scene = await this.scenes.findByIndex(campaign.id, input.sourceIndex);
      if (!scene?.imageKey || scene.imageStatus !== EAssetStatus.Ready) {
        throw new BadRequestException('This campaign image is not ready to publish.');
      }
      return { assetKey: scene.imageKey, title: `${campaign.title} · Image ${scene.index + 1}` };
    }

    if (input.mediaType !== 'IMAGE')
      throw new BadRequestException('Photoshoot images can only be published as images.');
    if (input.sourceIndex === undefined || input.sourceIndex < 0 || input.sourceIndex > 3) {
      throw new BadRequestException('Choose a finished photoshoot image.');
    }
    const shoot = await this.photoshoots.findForUser(input.sourceId, userId);
    if (!shoot) throw new NotFoundException('Photoshoot not found.');
    const shot = await this.shots.findByIndex(shoot.id, input.sourceIndex);
    if (!shot?.imageKey || shot.status !== EAssetStatus.Ready.toString()) {
      throw new BadRequestException('This photoshoot image is not ready to publish.');
    }
    return { assetKey: shot.imageKey, title: `${shoot.title} · Image ${shot.index + 1}` };
  }
}
