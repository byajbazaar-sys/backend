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

export const MARKETING_ENTITY_CLASSES = [
  MarketingCampaignEntity,
  MarketingSceneEntity,
  MarketingBrandEntity,
  KaggleAccountEntity,
  RenderJobEntity,
];
