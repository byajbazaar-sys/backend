import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Cloudflare Workers AI accounts added in admin. Only account state lives here; usage logs are in the logs database. */
@Entity('cloudflare_accounts')
@Index('UQ_cloudflare_accounts_account_id', ['accountId'], { unique: true })
export class CloudflareAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label: string | null;

  @Column({ type: 'varchar', length: 64, name: 'account_id' })
  accountId: string;

  /** Stored as plain text. */
  @Column({ type: 'text', name: 'api_token' })
  apiToken: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'timestamptz', name: 'cooldown_until', nullable: true })
  cooldownUntil: Date | null;

  @Column({ type: 'varchar', length: 500, name: 'last_error', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz', name: 'last_used_at', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
