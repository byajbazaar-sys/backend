import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';

import { OrderEntity } from './order.entity';
import { UserEntity } from './user.entity';
import { EOrderActivityType, EOrderStatus } from '../../../application/features/orders/enums';

@Entity('order_activities')
@Index(['orderId', 'createdAt'])
@Index(['createdBy'])
export class OrderActivityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => OrderEntity, (order) => order.activities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: OrderEntity;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @Column({ type: 'enum', enum: EOrderActivityType, enumName: 'e_order_activity_type_enum' })
  activityType: EOrderActivityType;

  @Column({ type: 'text', nullable: true })
  message?: string;

  @Column({ type: 'enum', enum: EOrderStatus, enumName: 'e_order_status_enum', nullable: true })
  fromStatus?: EOrderStatus;

  @Column({ type: 'enum', enum: EOrderStatus, enumName: 'e_order_status_enum', nullable: true })
  toStatus?: EOrderStatus;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  amount?: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
