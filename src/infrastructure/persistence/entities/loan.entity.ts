import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import {
  ELoanTenureType,
  EInterestCalculationMethod,
  EInterestType,
  ELoanStatus,
} from '../../../application/features/loans/enums';
import { UserEntity } from './user.entity';
import { CustomerEntity } from './customer.entity';
import { LoanItemEntity } from './loan-item.entity';
import { TransactionEntity } from './transaction.entity';
import { DueEntity } from './due.entity';

@Entity('loans')
export class LoanEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => CustomerEntity, (c) => c.loans, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: CustomerEntity;

  @Column({ type: 'enum', enum: ELoanTenureType, enumName: 'e_loan_tenure_type_enum' })
  tenureType: ELoanTenureType;

  @Column({ type: 'int' })
  tenureValue: number;

  @Column({ type: 'enum', enum: EInterestCalculationMethod, enumName: 'e_interest_calculation_method_enum' })
  interestCalculationMethod: EInterestCalculationMethod;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  interestPercentage: number;

  @Column({ type: 'enum', enum: EInterestType, enumName: 'e_interest_type_enum' })
  interestType: EInterestType;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountPaid: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountRemaining: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  interestPaid: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  interestRemaining: number;

  @Column({ type: 'enum', enum: ELoanStatus, enumName: 'e_loan_status_enum', default: ELoanStatus.OPEN })
  status: ELoanStatus;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  signerName?: string;

  @Column({ type: 'varchar', nullable: true })
  signatureRef?: string;

  @Column({ type: 'varchar', nullable: true })
  fingerprintRef?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  currentRate: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => LoanItemEntity, (li) => li.loan)
  loanItems: LoanItemEntity[];

  @OneToMany(() => TransactionEntity, (t) => t.loan)
  transactions: TransactionEntity[];

  @OneToMany(() => DueEntity, (d) => d.loan)
  dues: DueEntity[];
}
