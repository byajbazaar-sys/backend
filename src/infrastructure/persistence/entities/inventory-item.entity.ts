import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { InventoryCategoryEntity } from './inventory-category.entity';
import { UserEntity } from './user.entity';
import { EInventoryItemStatus, EMakingChargeMode, EMetalType } from '../../../application/features/inventory/enums';

@Entity('inventory_items')
@Index('UQ_inventory_items_created_by_sku', ['createdBy', 'sku'], { unique: true })
@Index('UQ_inventory_items_created_by_barcode', ['createdBy', 'barcode'], { unique: true })
@Index('IDX_inventory_items_created_by', ['createdBy'])
@Index('IDX_inventory_items_category_id', ['categoryId'])
@Index('IDX_inventory_items_status', ['status'])
@Index('IDX_inventory_items_catalog_visible', ['createdBy', 'isCatalogVisible'])
export class InventoryItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 20 })
  sku: string;

  @Column({ type: 'varchar', length: 20 })
  barcode: string;

  @Column({ type: 'text', nullable: true })
  qrValue: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  barcodeImageUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  qrImageUrl: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  itemCode: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  huid: string;

  @Column({ type: 'varchar', length: 255 })
  itemName: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => InventoryCategoryEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: InventoryCategoryEntity;

  @Column({ type: 'enum', enum: EMetalType, enumName: 'e_metal_type_enum' })
  metalType: EMetalType;

  @Column({ type: 'varchar', length: 50, nullable: true })
  purity: string;

  @Column({ type: 'numeric', precision: 10, scale: 3, default: 0 })
  grossWeight: number;

  @Column({ type: 'numeric', precision: 10, scale: 3, default: 0 })
  netWeight: number;

  @Column({ type: 'numeric', precision: 10, scale: 3, default: 0, name: 'less_weight' })
  lessWeight: number;

  @Column({ type: 'numeric', precision: 10, scale: 3, default: 0 })
  stoneWeight: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  makingCharges: number;

  @Column({
    type: 'enum',
    enum: EMakingChargeMode,
    enumName: 'e_making_charge_mode_enum',
    default: EMakingChargeMode.Fixed,
    name: 'making_charge_mode',
  })
  makingChargeMode: EMakingChargeMode;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  wastagePercentage: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  purchasePrice: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  purchaseRatePerGram: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  sellingPrice: number;

  @Column({
    type: 'enum',
    enum: EInventoryItemStatus,
    enumName: 'e_inventory_item_status_enum',
    default: EInventoryItemStatus.Available,
  })
  status: EInventoryItemStatus;

  @Column({ type: 'jsonb', default: [] })
  imageUrls: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string;

  @Column({ type: 'boolean', default: false })
  hallmarked: boolean;

  @Column({ type: 'int', default: 1, name: 'stock_quantity' })
  stockQuantity: number;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'supplier_name' })
  supplierName: string;

  @Column({ type: 'boolean', default: false, name: 'is_catalog_visible' })
  isCatalogVisible: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
