import { EUserType } from '@shared-libs';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';

import { CustomerEntity } from './customer.entity';
import { DueEntity } from './due.entity';
import { ItemEntity } from './item.entity';
import { LoanEntity } from './loan.entity';
import { NotificationEntity } from './notification.entity';
import { TransactionEntity } from './transaction.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 255, select: true, nullable: true })
  password: string;

  @Column({ type: 'boolean', default: false })
  isEmailVerified: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date;

  /** Verified via SMS OTP. Verified numbers are unique across users (partial unique index). */
  @Column({ type: 'boolean', default: false })
  isPhoneVerified: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  phoneVerifiedAt: Date;

  /** New accounts without a verified mobile (Google sign-up) must verify one before using the app. */
  @Column({ type: 'boolean', default: false })
  phoneVerificationRequired: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resetPasswordToken: string;

  @Column({ type: 'timestamptz', nullable: true })
  resetPasswordExpires: Date;


  @Column({ type: 'enum', enum: EUserType, enumName: 'e_user_type_enum', default: EUserType.User })
  userType: EUserType;

  @Column({ type: 'varchar', length: 500, nullable: true })
  profilePhotoRef: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  businessName: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'catalog_slug' })
  catalogSlug: string;

  @Column({ type: 'boolean', default: true, name: 'catalog_enabled' })
  catalogEnabled: boolean;

  /** Which item details the public catalog shows (see CATALOG_DISPLAY_FIELDS). */
  @Column({ type: 'jsonb', nullable: true, name: 'catalog_display' })
  catalogDisplay: Record<string, boolean> | null;

  /** WhatsApp number for catalog enquiries; falls back to the shop phone. */
  @Column({ type: 'varchar', length: 20, nullable: true, name: 'catalog_whatsapp_number' })
  catalogWhatsappNumber: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  gstin: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  pan: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  stateCode: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  proprietorName: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  shopLogoRef: string;

  /** Set on extra shops an owner adds: the person who owns this shop (their own account is their first shop). */
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  alternatePhoneNumber: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bankName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bankBranch: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bankAccountNumber: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  bankIfsc: string;

  @Column({ type: 'boolean', default: true, name: 'show_bank_details_on_bill' })
  showBankDetailsOnBill: boolean;

  @Column({ type: 'varchar', length: 7, nullable: true, name: 'try_on_background_color', default: '#1a1520' })
  tryOnBackgroundColor: string;

  /** Unique among active users only (partial index), so a deleted account can sign up again. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  googleId: string;

  @Column({ type: 'boolean', default: false })
  isGoogleUser: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date;

  @Column({ type: 'boolean', default: true })
  isFirstLogin: boolean;

  @Column({ type: 'timestamptz', nullable: true, name: 'trial_ends_at' })
  trialEndsAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date;

  @OneToMany(() => CustomerEntity, (c) => c.createdBy)
  customers: CustomerEntity[];

  @OneToMany(() => LoanEntity, (l) => l.createdBy)
  loans: LoanEntity[];

  @OneToMany(() => ItemEntity, (i) => i.createdBy)
  items: ItemEntity[];

  @OneToMany(() => TransactionEntity, (t) => t.createdBy)
  transactions: TransactionEntity[];

  @OneToMany(() => DueEntity, (d) => d.createdBy)
  dues: DueEntity[];

  @OneToMany(() => NotificationEntity, (n) => n.createdBy)
  notifications: NotificationEntity[];
}
