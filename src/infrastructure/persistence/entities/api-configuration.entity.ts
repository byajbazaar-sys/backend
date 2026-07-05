import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { ApiAccessTokenEntity } from './api-access-token.entity';

@Entity('api_configurations')
@Index('UQ_api_configurations_user_id', ['userId'], { unique: true })
@Index('UQ_api_configurations_api_key', ['apiKey'], { unique: true })
export class ApiConfigurationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 64, name: 'api_key' })
  apiKey: string;

  @Column({ type: 'varchar', length: 255, name: 'api_secret_hash' })
  apiSecretHash: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', name: 'last_used_at', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => ApiAccessTokenEntity, (token) => token.configuration)
  accessTokens?: ApiAccessTokenEntity[];
}
