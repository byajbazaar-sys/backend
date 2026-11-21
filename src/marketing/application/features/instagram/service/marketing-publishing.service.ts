import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';

import { MarketingInstagramService } from './marketing-instagram.service';
import { ScheduleMarketingPostInput, ScheduleMarketingPostItemInput } from './schedule-marketing-post-input';
import {
  InstagramPostOptions,
  MarketingScheduledPost,
  MarketingScheduledPostItem,
  EAssetStatus,
  IMarketingCampaignsRepository,
  MARKETING_CAMPAIGNS_REPOSITORY,
  IMarketingFileStorage,
  MARKETING_FILE_STORAGE,
  IMarketingPhotoshootShotsRepository,
  MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY,
  IMarketingPhotoshootsRepository,
  MARKETING_PHOTOSHOOTS_REPOSITORY,
  IMarketingScenesRepository,
  MARKETING_SCENES_REPOSITORY,
  IMarketingScheduledPostsRepository,
  MARKETING_SCHEDULED_POSTS_REPOSITORY,
} from '../../../shared';
import { MarketingBrandingService } from '../../branding/marketing-branding.service';

/** Instagram's own caption limits (posts over them are rejected at publish time). */
const MAX_HASHTAGS = 30;
const MAX_MENTIONS = 20;

function checkCaptionLimits(caption: string): void {
  const hashtags = caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  if (hashtags > MAX_HASHTAGS) {
    throw new BadRequestException(`Instagram allows at most ${MAX_HASHTAGS} hashtags (this caption has ${hashtags}).`);
  }
  const mentions = caption.match(/@[A-Za-z0-9._]+/g)?.length ?? 0;
  if (mentions > MAX_MENTIONS) {
    throw new BadRequestException(`Instagram allows at most ${MAX_MENTIONS} @mentions in a caption.`);
  }
}

const username = (value: string) => value.trim().replace(/^@/, '').toLowerCase();

/** Keeps only the options that apply to this kind of post, trimmed; null when nothing is set. */
function cleanOptions(
  options: InstagramPostOptions | undefined,
  mediaType: MarketingScheduledPost['mediaType'],
): InstagramPostOptions | null {
  if (!options) return null;
  const text = (value?: string) => value?.trim() || undefined;
  const collaborators = [...new Set((options.collaborators ?? []).map(username).filter(Boolean))].slice(0, 3);
  const userTags = (options.userTags ?? [])
    .map((tag) => ({ ...tag, username: username(tag.username) }))
    .filter((tag, i, all) => tag.username && all.findIndex((t) => t.username === tag.username) === i)
    .slice(0, 20);
  const reel = mediaType === 'REEL';
  const cleaned: InstagramPostOptions = {
    // Only photos carry the logo (reels are videos).
    logoOverlay: mediaType !== 'REEL' && typeof options.logoOverlay === 'boolean' ? options.logoOverlay : undefined,
    locationId: text(options.locationId),
    locationName: options.locationId ? text(options.locationName) : undefined,
    collaborators: collaborators.length ? collaborators : undefined,
    userTags: userTags.length ? userTags : undefined,
    altText: mediaType === 'IMAGE' ? text(options.altText) : undefined,
    commentsDisabled: options.commentsDisabled || undefined,
    // No first comment on a post with comments turned off.
    firstComment: options.commentsDisabled ? undefined : text(options.firstComment),
    shareToFeed: reel && options.shareToFeed === false ? false : undefined,
    audioName: reel ? text(options.audioName) : undefined,
    thumbOffsetMs: reel && options.thumbOffsetMs !== undefined ? options.thumbOffsetMs : undefined,
  };
  if (cleaned.firstComment) checkCaptionLimits(cleaned.firstComment);
  const set = Object.fromEntries(Object.entries(cleaned).filter(([, v]) => v !== undefined)) as InstagramPostOptions;
  return Object.keys(set).length ? set : null;
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
    private readonly branding: MarketingBrandingService,
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
    const caption = input.caption.trim();
    checkCaptionLimits(caption);
    if (!(await this.instagram.status(userId)).connected) {
      throw new ConflictException('Connect your Instagram account before scheduling a post.');
    }

    const requested = input.items?.length ? input.items : [input];
    if (requested.length > 10) throw new BadRequestException('A carousel can have at most 10 photos or videos.');
    const keys = requested.map(
      (item) => `${item.sourceType}:${item.sourceId}:${item.mediaType}:${item.sourceIndex ?? ''}`,
    );
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('The same photo or video is in the carousel twice.');
    }

    const items: MarketingScheduledPostItem[] = [];
    for (const item of requested) {
      const source = await this.resolveSource(userId, item);
      if (!(await this.storage.existsAsync(source.assetKey))) {
        throw new BadRequestException(`"${source.title}" is no longer available.`);
      }
      items.push({
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        sourceIndex: item.sourceIndex ?? null,
        mediaType: item.mediaType,
        assetKey: source.assetKey,
        title: source.title,
      });
    }

    const first = items[0];
    const carousel = items.length > 1;
    const mediaType: MarketingScheduledPost['mediaType'] = carousel ? 'CAROUSEL' : first.mediaType;
    return this.posts.create({
      userId,
      sourceType: first.sourceType,
      sourceId: first.sourceId,
      sourceIndex: first.sourceIndex,
      sourceTitle: (carousel ? `${first.title} +${items.length - 1}` : first.title).slice(0, 255),
      assetKey: first.assetKey,
      items: carousel ? items : null,
      options: cleanOptions(input.options, mediaType),
      mediaType,
      caption,
      scheduledAt,
      status: 'SCHEDULED',
      instagramMediaId: null,
      error: null,
      warning: null,
      publishedAt: null,
    });
  }

  /** Places to tag on a post (Instagram location). */
  async searchPlaces(userId: string, query: string) {
    const q = query.trim();
    if (q.length < 2) return { available: true, places: [] };
    return this.instagram.searchPlaces(userId, q.slice(0, 80));
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
      const uploadKeys: string[] = [];
      try {
        const items = post.items?.length
          ? post.items
          : [
              {
                mediaType: post.mediaType === 'REEL' ? ('REEL' as const) : ('IMAGE' as const),
                assetKey: post.assetKey,
              },
            ];
        const urls: { mediaType: 'IMAGE' | 'REEL'; url: string }[] = [];
        for (const [index, item] of items.entries()) {
          let key = item.assetKey;
          if (item.mediaType === 'IMAGE') {
            // Instagram feed photos (and every carousel card) at 4:5, 1080 × 1350.
            const cropped = await sharp(await this.storage.readAsync(item.assetKey))
              .resize(1080, 1350, { fit: 'cover', position: 'centre' })
              .jpeg({ quality: 90 })
              .toBuffer();
            // The logo goes on after the 4:5 crop, so it always sits in the visible top-left corner.
            const { image: normalized } = await this.branding.apply(post.userId, cropped, post.options?.logoOverlay);
            key = await this.storage.writeAsync(
              `instagram/${post.userId}/scheduled-${post.id}-${index}.jpg`,
              normalized,
              'image/jpeg',
            );
            uploadKeys.push(key);
          }
          urls.push({ mediaType: item.mediaType, url: await this.storage.getUrlAsync(key) });
        }
        const { mediaId, warnings } = await this.instagram.publishPost(post.userId, {
          mediaType: post.mediaType,
          items: urls,
          caption: post.caption,
          options: post.options,
        });
        await this.posts.update(post.id, {
          status: 'PUBLISHED',
          instagramMediaId: mediaId,
          publishedAt: new Date(),
          error: null,
          warning: warnings.length ? warnings.join(' ') : null,
        });
        published += 1;
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
        await this.posts.update(post.id, { status: 'FAILED', error: message });
        this.logger.error({ postId: post.id, userId: post.userId, err: message }, 'Instagram scheduled post failed');
        failed += 1;
      } finally {
        for (const uploadKey of uploadKeys) {
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

  /** The stored file behind a library photo / video, after checking it belongs to the user and is finished. */
  async resolveSource(
    userId: string,
    input: ScheduleMarketingPostItemInput,
  ): Promise<{ assetKey: string; title: string }> {
    if (input.sourceType === 'campaign') {
      const campaign = await this.campaigns.findForUser(input.sourceId, userId);
      if (!campaign) throw new NotFoundException('Campaign not found.');
      if (input.mediaType === 'REEL') {
        // A reel is one scene's clip. Campaigns from before clips were the deliverable may still have a merged film.
        if (input.sourceIndex === undefined) {
          if (!campaign.mergedVideoKey) throw new BadRequestException('Choose a finished scene video.');
          return { assetKey: campaign.mergedVideoKey, title: campaign.title };
        }
        if (input.sourceIndex < 0 || input.sourceIndex > 4)
          throw new BadRequestException('Choose a finished scene video.');
        const clip = await this.scenes.findByIndex(campaign.id, input.sourceIndex);
        if (!clip?.videoKey || clip.videoStatus !== EAssetStatus.Ready) {
          throw new BadRequestException('This scene video is not ready to publish.');
        }
        return { assetKey: clip.videoKey, title: `${campaign.title} · Video ${clip.index + 1}` };
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
