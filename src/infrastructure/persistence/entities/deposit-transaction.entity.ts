import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CustomerEntity } from './customer.entity';
import { UserEntity } from './user.entity';
import { SalesBillEntity } from './sales-bill.entity';
import { DepositAccountEntity } from './deposit-account.entity';
import { DepositReceiptEntity } from './deposit-receipt.entity';
import { EDepositTransactionType } from '../../../application/features/deposits/enums';

@Entity('deposit_transactions')
@Index(['depositAccountId'])
@Index(['transactionDate'])
export class DepositTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  depositAccountId: string;

  @ManyToOne(() => DepositAccountEntity, (a) => a.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deposit_account_id' })
  depositAccount: DepositAccountEntity;

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

  @Column({ type: 'enum', enum: EDepositTransactionType, enumName: 'e_deposit_transaction_type_enum' })
  type: EDepositTransactionType;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  balanceAfter: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  paymentMode: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  transactionReference: string;

  @Column({ type: 'uuid', nullable: true })
  salesBillId: string;

  @ManyToOne(() => SalesBillEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sales_bill_id' })
  salesBill: SalesBillEntity;

  @Column({ type: 'timestamptz' })
  transactionDate: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToOne(() => DepositReceiptEntity, (r) => r.depositTransaction)
  receipt: DepositReceiptEntity;
}
