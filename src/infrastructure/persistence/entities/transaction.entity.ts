import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { CustomerEntity } from './customer.entity';
import { DueEntity } from './due.entity';
import { LoanEntity } from './loan.entity';
import { UserEntity } from './user.entity';
import { ETransactionType, ETransactionPaidIn } from '../../../application/features/transactions/enums';

@Entity('transactions')
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  loanId: string;

  @ManyToOne(() => LoanEntity, (l) => l.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loan_id' })
  loan: LoanEntity;

  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => CustomerEntity, (c) => c.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: CustomerEntity;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: ETransactionType, enumName: 'e_transaction_type_enum' })
  transactionType: ETransactionType;

  @Column({ type: 'enum', enum: ETransactionPaidIn, enumName: 'e_transaction_paid_in_enum' })
  paidIn: ETransactionPaidIn;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, (u) => u.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @Column({ type: 'uuid', nullable: true })
  dueId: string;

  @ManyToOne(() => DueEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'due_id' })
  due: DueEntity;

  /**
   * Signed effect this transaction applied to the loan. Recorded at creation so
   * rollback is exact subtraction rather than recomputing a formula against
   * present-day state. All four zero means the row predates this tracking.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountRemainingDelta: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountPaidDelta: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  interestRemainingDelta: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  interestPaidDelta: number;

  /** Unpaid due count used to price a top-up's interest. */
  @Column({ type: 'int', nullable: true })
  periodsAtCreation: number;

  /** Monotonic position within the loan; defines replay order. */
  @Column({ type: 'int', nullable: true })
  loanSeq: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
