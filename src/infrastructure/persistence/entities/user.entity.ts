import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { EUserType } from '@shared-libs';
import { CustomerEntity } from './customer.entity';
import { LoanEntity } from './loan.entity';
import { ItemEntity } from './item.entity';
import { TransactionEntity } from './transaction.entity';
import { DueEntity } from './due.entity';
import { NotificationEntity } from './notification.entity';

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

  @Column({ type: 'varchar', length: 255, nullable: true })
  resetPasswordToken: string;

  @Column({ type: 'timestamptz', nullable: true })
  resetPasswordExpires: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emailVerificationToken: string;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerificationExpires: Date;

  @Column({ type: 'enum', enum: EUserType, enumName: 'e_user_type_enum', default: EUserType.User })
  userType: EUserType;

  @Column({ type: 'varchar', length: 500, nullable: true })
  profilePhotoRef: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  businessName: string;

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

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  googleId: string;

  @Column({ type: 'boolean', default: false })
  isGoogleUser: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date;

  @Column({ type: 'boolean', default: true })
  isFirstLogin: boolean;

  @Column({ type: 'timestamptz', nullable: true, name: 'trial_ends_at' })
  trialEndsAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

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
