import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** user_id columns refer to ByajBazaar users in the main database — there are no cross-database foreign keys. */

@Entity('marketing_campaigns')
@Index('IDX_marketing_campaigns_user_created', ['userId', 'createdAt'])
export class MarketingCampaignEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'varchar', length: 255 }) title: string;
  @Column({ type: 'varchar', length: 20 }) sourceType: string;
  @Column({ type: 'uuid', nullable: true }) inventoryItemId: string | null;
  @Column({ type: 'varchar', length: 500 }) sourceImageKey: string;
  @Column({ type: 'varchar', length: 30 }) style: string;
  @Column({ type: 'varchar', length: 10 }) quality: string;
  @Column({ type: 'varchar', length: 10, default: 'exact' }) imageMode: string;
  @Column({ type: 'varchar', length: 20 }) status: string;
  @Column({ type: 'smallint', default: 0 }) progress: number;
  @Column({ type: 'varchar', length: 255, nullable: true }) stageMessage: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) mergedVideoKey: string | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('marketing_scenes')
@Index('UQ_marketing_scenes_campaign_index', ['campaignId', 'index'], { unique: true })
export class MarketingSceneEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) campaignId: string;
  @Column({ type: 'smallint' }) index: number;
  @Column({ type: 'text' }) imagePrompt: string;
  @Column({ type: 'text' }) motionPrompt: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) imageKey: string | null;
  @Column({ type: 'varchar', length: 20 }) imageStatus: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) videoKey: string | null;
  @Column({ type: 'varchar', length: 20 }) videoStatus: string;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('marketing_brands')
export class MarketingBrandEntity {
  @PrimaryColumn({ type: 'uuid' }) userId: string;
  @Column({ type: 'varchar', length: 255 }) businessName: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) logoImageKey: string | null;
  @Column({ type: 'varchar', length: 20 }) logoImageStatus: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) logoVideoKey: string | null;
  @Column({ type: 'varchar', length: 20 }) logoVideoStatus: string;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('kaggle_accounts')
export class KaggleAccountEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 }) username: string;
  @Column({ type: 'varchar', length: 20 }) status: string;
  @Column({ type: 'smallint', default: 1 }) concurrency: number;
  @Column({ type: 'text', nullable: true }) lastError: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) gpuInfo: string | null;
  @Column({ type: 'timestamptz', nullable: true }) setupAttemptAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) readyAt: Date | null;
  @Column({ type: 'real', nullable: true }) gpuHoursLeft: number | null;
  @Column({ type: 'timestamptz', nullable: true }) quotaCheckedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) cooldownUntil: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) lastAssignedAt: Date | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) modelsDataset: string | null;
  @Column({ type: 'timestamptz', nullable: true }) modelsAttemptAt: Date | null;
  @Column({ type: 'integer', default: 0 }) jobsCompleted: number;
  @Column({ type: 'integer', default: 0 }) jobsFailed: number;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

/** Kaggle API credentials (source of truth for which accounts render); runtime state lives in kaggle_accounts. */
@Entity('kaggle_credentials')
export class KaggleCredentialEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index('UQ_kaggle_credentials_username', { unique: true })
  @Column({ type: 'varchar', length: 100 })
  username: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) label: string | null;
  /** AES-256-GCM ciphertext of the API key / access token. */
  @Column({ type: 'text' }) apiKeyEncrypted: string;
  @Column({ type: 'smallint', default: 1 }) concurrency: number;
  @Column({ type: 'boolean', default: true }) enabled: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('marketing_instagram_connections')
@Index('UQ_marketing_instagram_connections_state_hash', ['oauthStateHash'], { unique: true })
export class MarketingInstagramConnectionEntity {
  @PrimaryColumn({ type: 'uuid' }) userId: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) instagramUserId: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) username: string | null;
  @Column({ type: 'text', nullable: true }) accessTokenEncrypted: string | null;
  @Column({ type: 'timestamptz', nullable: true }) tokenExpiresAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) connectedAt: Date | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) oauthStateHash: string | null;
  @Column({ type: 'timestamptz', nullable: true }) oauthStateExpiresAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('marketing_render_jobs')
@Index('IDX_marketing_render_jobs_status_created', ['status', 'createdAt'])
export class RenderJobEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 20 }) kind: string;
  @Column({ type: 'uuid', nullable: true }) userId: string | null;
  @Column({ type: 'uuid', nullable: true }) campaignId: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) workerId: string | null;
  @Column({ type: 'smallint', nullable: true }) slot: number | null;
  @Column({ type: 'varchar', length: 20 }) status: string;
  @Column({ type: 'jsonb' }) payload: Record<string, unknown>;
  @Column({ type: 'smallint', default: 0 }) progress: number;
  @Column({ type: 'varchar', length: 255, nullable: true }) stageMessage: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) kernelRef: string | null;
  @Column({ type: 'smallint', default: 0 }) attempts: number;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'timestamptz', nullable: true }) startedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) finishedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('marketing_photoshoots')
@Index('IDX_marketing_photoshoots_user_created', ['userId', 'createdAt'])
export class MarketingPhotoshootEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'varchar', length: 255 }) title: string;
  @Column({ type: 'uuid', nullable: true }) inventoryItemId: string | null;
  @Column({ type: 'varchar', length: 500 }) sourceImageKey: string;
  @Column({ type: 'jsonb' }) piece: Record<string, unknown>;
  @Column({ type: 'varchar', length: 20 }) setting: string;
  @Column({ type: 'varchar', length: 10 }) model: string;
  @Column({ type: 'varchar', length: 20 }) outfit: string;
  @Column({ type: 'varchar', length: 8 }) aspect: string;
  @Column({ type: 'varchar', length: 10, default: 'exact' }) imageMode: string;
  @Column({ type: 'varchar', length: 20 }) status: string;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('marketing_photoshoot_shots')
@Index('UQ_marketing_photoshoot_shots_index', ['photoshootId', 'index'], { unique: true })
export class MarketingPhotoshootShotEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) photoshootId: string;
  @Column({ type: 'smallint' }) index: number;
  @Column({ type: 'varchar', length: 20 }) kind: string;
  @Column({ type: 'text' }) prompt: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) imageKey: string | null;
  @Column({ type: 'varchar', length: 20 }) status: string;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('marketing_scheduled_posts')
@Index('IDX_marketing_scheduled_posts_user_date', ['userId', 'scheduledAt'])
@Index('IDX_marketing_scheduled_posts_due', ['status', 'scheduledAt'])
export class MarketingScheduledPostEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'varchar', length: 10 }) mediaType: string;
  @Column({ type: 'varchar', length: 20 }) sourceType: string;
  @Column({ type: 'uuid' }) sourceId: string;
  @Column({ type: 'smallint', nullable: true }) sourceIndex: number | null;
  @Column({ type: 'varchar', length: 255 }) sourceTitle: string;
  @Column({ type: 'varchar', length: 500 }) assetKey: string;
  @Column({ type: 'text' }) caption: string;
  @Column({ type: 'timestamptz' }) scheduledAt: Date;
  @Column({ type: 'varchar', length: 20, default: 'SCHEDULED' }) status: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) instagramMediaId: string | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

/** Admin-editable settings (key → JSON value). */
@Entity('marketing_settings')
export class MarketingSettingEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 }) key: string;
  @Column({ type: 'jsonb' }) value: unknown;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

export const MARKETING_ENTITY_CLASSES = [
  MarketingCampaignEntity,
  MarketingSceneEntity,
  MarketingBrandEntity,
  KaggleAccountEntity,
  KaggleCredentialEntity,
  MarketingInstagramConnectionEntity,
  RenderJobEntity,
  MarketingPhotoshootEntity,
  MarketingPhotoshootShotEntity,
  MarketingScheduledPostEntity,
  MarketingSettingEntity,
];
