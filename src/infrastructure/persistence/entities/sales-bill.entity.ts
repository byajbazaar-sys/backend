import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { EPaymentMode, EBillStatus } from '../../../application/features/sales-bills/enums';
import { SalesBillItemEntity } from './sales-bill-item.entity';

@Entity('sales_bills')
@Index('IDX_sales_bills_bill_number', ['billNumber'])
@Index('IDX_sales_bills_customer_name', ['customerName'])
@Index('IDX_sales_bills_customer_mobile', ['customerMobile'])
@Index('IDX_sales_bills_created_at', ['createdAt'])
@Index('IDX_sales_bills_created_by', ['createdBy'])
export class SalesBillEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @Column({ type: 'varchar', length: 32 })
  billNumber: string;

  @Column({ type: 'varchar', length: 255, default: 'Walk-in' })
  customerName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  customerMobile: string | null;

  @Column({ type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  discount: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  grandTotal: number;

  @Column({ type: 'enum', enum: EPaymentMode, enumName: 'e_payment_mode_enum', default: EPaymentMode.Cash })
  paymentMode: EPaymentMode;

  @Column({ type: 'enum', enum: EBillStatus, enumName: 'e_bill_status_enum', default: EBillStatus.Completed })
  status: EBillStatus;

  @Column({ type: 'timestamptz' })
  issuedAt: Date;

  @OneToMany(() => SalesBillItemEntity, (item) => item.bill, { cascade: true })
  items: SalesBillItemEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
