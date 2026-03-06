import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
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
  firstName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, select: true })
  password: string;

  @Column({ type: 'boolean', default: false })
  isEmailVerified: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resetPasswordToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resetPasswordExpires: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emailVerificationToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerificationExpires: Date | null;

  @Column({ type: 'enum', enum: EUserType, enumName: 'e_user_type_enum', default: EUserType.User })
  userType: EUserType;

  @Column({ type: 'varchar', length: 500, nullable: true })
  profilePhotoRef: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  businessName: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => CustomerEntity, (c) => c.createdByUser)
  customers: CustomerEntity[];

  @OneToMany(() => LoanEntity, (l) => l.createdByUser)
  loans: LoanEntity[];

  @OneToMany(() => ItemEntity, (i) => i.createdByUser)
  items: ItemEntity[];

  @OneToMany(() => TransactionEntity, (t) => t.createdByUser)
  transactions: TransactionEntity[];

  @OneToMany(() => DueEntity, (d) => d.createdByUser)
  dues: DueEntity[];

  @OneToMany(() => NotificationEntity, (n) => n.createdByUser)
  notifications: NotificationEntity[];
}
