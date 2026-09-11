import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';

import { CustomerEntity } from './customer.entity';
import { OrderActivityEntity } from './order-activity.entity';
import { OrderAttachmentEntity } from './order-attachment.entity';
import { UserEntity } from './user.entity';
import { EOrderPriority, EOrderStatus, EOrderType } from '../../../application/features/orders/enums';

@Entity('orders')
@Index(['createdBy', 'orderNumber'], { unique: true })
@Index(['createdBy', 'status'])
@Index(['createdBy', 'orderType'])
@Index(['customerId'])
@Index(['assignedTo'])
@Index(['dueDate'])
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  orderNumber: string;

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

  @Column({ type: 'uuid', nullable: true })
  assignedTo?: string;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_to' })
  assignee?: UserEntity;

  @Column({ type: 'enum', enum: EOrderType, enumName: 'e_order_type_enum' })
  orderType: EOrderType;

  @Column({ type: 'enum', enum: EOrderStatus, enumName: 'e_order_status_enum', default: EOrderStatus.NEW })
  status: EOrderStatus;

  @Column({ type: 'enum', enum: EOrderPriority, enumName: 'e_order_priority_enum', default: EOrderPriority.NORMAL })
  priority: EOrderPriority;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'timestamptz', nullable: true })
  dueDate?: Date;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  estimatedAmount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  finalAmount?: number;

  /** @deprecated Legacy mirror of effective amount — kept for backward compatibility */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => OrderActivityEntity, (activity) => activity.order)
  activities: OrderActivityEntity[];

  @OneToMany(() => OrderAttachmentEntity, (attachment) => attachment.order)
  attachments: OrderAttachmentEntity[];
}
