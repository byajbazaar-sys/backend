import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  ETransactionLogAction,
  ETransactionPaidIn,
  ETransactionType,
} from '../../../application/features/transactions/enums';
import { UserEntity } from './user.entity';
import { LoanEntity } from './loan.entity';
import { TransactionEntity } from './transaction.entity';

@Entity('transaction_logs')
export class TransactionLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  transactionId: string;

  @ManyToOne(() => TransactionEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: TransactionEntity;

  @Column({ type: 'uuid' })
  loanId: string;

  @ManyToOne(() => LoanEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loan_id' })
  loan: LoanEntity;

  @Column({ type: 'enum', enum: ETransactionLogAction, enumName: 'e_transaction_log_action_enum' })
  action: ETransactionLogAction;

  @Column({ type: 'enum', enum: ETransactionType, enumName: 'e_transaction_type_enum', nullable: true })
  transactionType: ETransactionType;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  previousAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  newAmount: number;

  @Column({ type: 'enum', enum: ETransactionPaidIn, enumName: 'e_transaction_paid_in_enum', nullable: true })
  previousPaidIn: ETransactionPaidIn;

  @Column({ type: 'enum', enum: ETransactionPaidIn, enumName: 'e_transaction_paid_in_enum', nullable: true })
  newPaidIn: ETransactionPaidIn;

  @Column({ type: 'int', nullable: true })
  loanVersion: number;

  @Column({ type: 'uuid' })
  performedBy: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'performed_by' })
  performer: UserEntity;

  @CreateDateColumn()
  createdAt: Date;
}
