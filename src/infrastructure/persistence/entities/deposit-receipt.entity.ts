import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToOne, JoinColumn } from 'typeorm';

import { DepositTransactionEntity } from './deposit-transaction.entity';
import { UserEntity } from './user.entity';

@Entity('deposit_receipts')
export class DepositReceiptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  depositTransactionId: string;

  @OneToOne(() => DepositTransactionEntity, (t) => t.receipt, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deposit_transaction_id' })
  depositTransaction: DepositTransactionEntity;

  @Column({ type: 'varchar', length: 32 })
  receiptNumber: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @CreateDateColumn()
  createdAt: Date;
}
