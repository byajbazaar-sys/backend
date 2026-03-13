import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LoanEntity } from './loan.entity';
import { ItemEntity } from './item.entity';
import { UserEntity } from './user.entity';

@Entity('loan_items')
export class LoanItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  loanId: string;

  @ManyToOne(() => LoanEntity, (l) => l.loanItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loan_id' })
  loan: LoanEntity;

  @Column({ type: 'uuid' })
  itemId: string;

  @ManyToOne(() => ItemEntity, (i) => i.loanItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: ItemEntity;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 255 })
  itemName: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  itemDescription: string;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  netWeightInGrams: number;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  grossWeightInGrams: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageRef: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
