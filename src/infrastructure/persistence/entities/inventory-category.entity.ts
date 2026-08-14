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

import { InventoryItemEntity } from './inventory-item.entity';
import { UserEntity } from './user.entity';

@Entity('inventory_categories')
export class InventoryCategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string;

  @Column({ type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ type: 'varchar', length: 8, nullable: true })
  hsnCode: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => InventoryItemEntity, (item) => item.category)
  items: InventoryItemEntity[];
}
