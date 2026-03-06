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
import { EDueType } from '../../../application/shared/enums';
import { UserEntity } from './user.entity';
import { LoanEntity } from './loan.entity';
import { CustomerEntity } from './customer.entity';

@Entity('dues')
@Index(['loanId', 'dueDate'])
@Index(['createdById', 'type'])
export class DueEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  loanId: string;

  @ManyToOne(() => LoanEntity, (l) => l.dues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loan_id' })
  loan: LoanEntity;

  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => CustomerEntity, (c) => c.dues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: CustomerEntity;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  dueAmount: number;

  @Column({ type: 'enum', enum: EDueType, enumName: 'e_due_type_enum' })
  type: EDueType;

  @Column({ type: 'timestamptz' })
  dueDate: Date;

  @Column({ type: 'uuid' })
  createdById: string;

  @ManyToOne(() => UserEntity, (u) => u.dues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdByUser: UserEntity;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  principalAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  interestAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
