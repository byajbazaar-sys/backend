import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { UserEntity } from './user.entity';

/** Audit trail of every operation on a bill. Rows outlive the bill. */
@Entity('bill_logs')
@Index('IDX_bill_logs_bill_created', ['billId', 'createdAt'])
@Index('IDX_bill_logs_user_created', ['userId', 'createdAt'])
export class BillLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** No foreign key: a deleted bill's history stays linked to its id. */
  @Column({ type: 'uuid', nullable: true })
  billId: string | null;

  @Column({ type: 'varchar', length: 64 })
  billNumber: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 40 })
  action: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  changes: unknown[];

  @Column({ type: 'jsonb', nullable: true })
  snapshot: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  channel: string | null;

  @Column({ type: 'uuid', nullable: true })
  performedBy: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'performed_by' })
  performer: UserEntity;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
