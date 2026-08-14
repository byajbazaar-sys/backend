import { ENotificationChannel, ENotificationStatus } from '@shared-libs';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { UserEntity } from './user.entity';

@Entity('notifications')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ENotificationChannel, enumName: 'e_notification_channel_enum' })
  channel: ENotificationChannel;

  @Column({ type: 'varchar', length: 255 })
  recipient: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: ENotificationStatus, enumName: 'e_notification_status_enum' })
  status: ENotificationStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @Column({ type: 'varchar', length: 500, nullable: true })
  errorMessage: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, (u) => u.notifications, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
