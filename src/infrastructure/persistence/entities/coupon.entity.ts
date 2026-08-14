import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

import { ECouponType } from '../../../application/features/payments/domain/enums';

@Entity('coupons')
@Index('UQ_coupons_code', ['code'], { unique: true })
export class CouponEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'enum', enum: ECouponType, enumName: 'e_coupon_type_enum' })
  type: ECouponType;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  value: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'minimum_amount', default: 0 })
  minimumAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'maximum_discount', nullable: true })
  maximumDiscount: number;

  @Column({ type: 'timestamptz', nullable: true })
  expiry: Date;

  @Column({ type: 'integer', name: 'maximum_redemption', nullable: true })
  maximumRedemption: number;

  @Column({ type: 'integer', name: 'used_count', default: 0 })
  usedCount: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'boolean', name: 'once_per_user', default: true })
  oncePerUser: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
