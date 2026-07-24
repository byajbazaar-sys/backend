import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { CustomerEntity } from './customer.entity';
import { UserEntity } from './user.entity';
import { EDepositStatus } from '../../../application/features/deposits/enums';
import { DepositTransactionEntity } from './deposit-transaction.entity';

@Entity('deposit_accounts')
@Index(['createdBy', 'depositNumber'], { unique: true })
export class DepositAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  depositNumber: string;

  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => CustomerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: CustomerEntity;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  currentBalance: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalDeposited: number;

  @Column({ type: 'enum', enum: EDepositStatus, enumName: 'e_deposit_status_enum', default: EDepositStatus.ACTIVE })
  status: EDepositStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => DepositTransactionEntity, (t) => t.depositAccount)
  transactions: DepositTransactionEntity[];
}
