import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { SubscriptionEntity } from './subscription.entity';

@Entity('payment_orders')
@Index('IDX_payment_orders_user_id', ['userId'])
export class PaymentOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'uuid', name: 'subscription_id', nullable: true })
  subscriptionId: string;

  @ManyToOne(() => SubscriptionEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'subscription_id' })
  subscription?: SubscriptionEntity;

  @Column({ type: 'varchar', length: 128, name: 'provider_order_id', nullable: true })
  providerOrderId: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  receipt: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 8, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 64 })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  notes: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'raw_json', default: {} })
  rawJson: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
