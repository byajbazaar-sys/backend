import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { SalesBillEntity } from './sales-bill.entity';

@Entity('sales_bill_items')
@Index('IDX_sales_bill_items_bill_id', ['billId'])
export class SalesBillItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  billId: string;

  @ManyToOne(() => SalesBillEntity, (bill) => bill.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bill_id' })
  bill: SalesBillEntity;

  @Column({ type: 'uuid', nullable: true })
  inventoryItemId: string | null;

  @Column({ type: 'varchar', length: 255 })
  itemName: string;

  @Column({ type: 'varchar', length: 20 })
  sku: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  barcode: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  metalType: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  purity: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  grossWeight: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  netWeight: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  lessWeight: number | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  hsnCode: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  huid: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  makingCharges: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  sellingPrice: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  lineTotal: number;
}
