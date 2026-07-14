import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ESubscriptionStatus } from '../../../application/features/payments/domain/enums';
import { UserEntity } from './user.entity';
import { CouponEntity } from './coupon.entity';

@Entity('subscriptions')
@Index('IDX_subscriptions_user_id_status', ['userId', 'status'])
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 128, name: 'plan_id' })
  planId: string;

  @Column({ type: 'varchar', length: 32, default: 'razorpay' })
  provider: string;

  @Column({ type: 'varchar', length: 128, name: 'provider_subscription_id', nullable: true })
  providerSubscriptionId: string | null;

  @Column({ type: 'varchar', length: 128, name: 'provider_customer_id', nullable: true })
  providerCustomerId: string | null;

  @Column({
    type: 'enum',
    enum: ESubscriptionStatus,
    enumName: 'e_subscription_status_enum',
    default: ESubscriptionStatus.Created,
  })
  status: ESubscriptionStatus;

  @Column({ type: 'timestamptz', name: 'current_start', nullable: true })
  currentStart: Date | null;

  @Column({ type: 'timestamptz', name: 'current_end', nullable: true })
  currentEnd: Date | null;

  @Column({ type: 'timestamptz', name: 'next_billing_at', nullable: true })
  nextBillingAt: Date | null;

  @Column({ type: 'boolean', name: 'cancel_at_period_end', default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 8, default: 'INR' })
  currency: string;

  @Column({ type: 'uuid', name: 'coupon_id', nullable: true })
  couponId: string | null;

  @ManyToOne(() => CouponEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'coupon_id' })
  coupon?: CouponEntity | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'discount_amount', default: 0 })
  discountAmount: number;

  @Column({ type: 'jsonb', nullable: true })
  notes: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
