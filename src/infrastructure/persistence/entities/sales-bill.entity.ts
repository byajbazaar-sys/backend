import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { EPaymentMode, EBillStatus, EDocumentType } from '../../../application/features/sales-bills/enums';
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

  @Column({
    type: 'enum',
    enum: EDocumentType,
    enumName: 'e_document_type_enum',
    default: EDocumentType.NormalBill,
  })
  documentType: EDocumentType;

  @Column({ type: 'varchar', length: 255, default: 'Walk-in' })
  customerName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  customerMobile: string | null;

  @Column({ type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  customerAddress: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  customerState: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  customerStateCode: string | null;

  @Column({ type: 'varchar', length: 15, nullable: true })
  customerGstin: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  customerPan: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerPropName: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  discount: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 1.5 })
  cgstRate: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 1.5 })
  sgstRate: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  cgstAmount: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  sgstAmount: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  roundOff: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  goldRate24k: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metalRates: Record<string, number> | null;

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
