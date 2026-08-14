import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';

import { CouponEntity } from './coupon.entity';
import { SubscriptionEntity } from './subscription.entity';
import { UserEntity } from './user.entity';

@Entity('coupon_redemptions')
@Index('UQ_coupon_redemptions_coupon_user', ['couponId', 'userId'], { unique: true })
export class CouponRedemptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'coupon_id' })
  couponId: string;

  @ManyToOne(() => CouponEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupon_id' })
  coupon?: CouponEntity;

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

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'discount_amount' })
  discountAmount: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
