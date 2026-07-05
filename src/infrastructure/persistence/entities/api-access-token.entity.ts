import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiConfigurationEntity } from './api-configuration.entity';

@Entity('api_access_tokens')
@Index('IDX_api_access_tokens_hash', ['accessTokenHash'])
@Index('IDX_api_access_tokens_configuration_id', ['apiConfigurationId'])
export class ApiAccessTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'api_configuration_id' })
  apiConfigurationId: string;

  @ManyToOne(() => ApiConfigurationEntity, (config) => config.accessTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'api_configuration_id' })
  configuration: ApiConfigurationEntity;

  @Column({ type: 'varchar', length: 64, name: 'access_token_hash' })
  accessTokenHash: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', name: 'last_used_at', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', length: 120, name: 'device_name', nullable: true })
  deviceName: string | null;

  @Column({ type: 'varchar', length: 120, name: 'client_name', nullable: true })
  clientName: string | null;
}
