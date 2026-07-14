import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { SubscriptionEntity } from './subscription.entity';

@Entity('payments')
@Index('IDX_payments_user_id', ['userId'])
@Index('UQ_payments_provider_payment_id', ['providerPaymentId'], { unique: true })
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'uuid', name: 'subscription_id', nullable: true })
  subscriptionId: string | null;

  @ManyToOne(() => SubscriptionEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'subscription_id' })
  subscription?: SubscriptionEntity | null;

  @Column({ type: 'varchar', length: 128, name: 'provider_payment_id' })
  providerPaymentId: string;

  @Column({ type: 'varchar', length: 128, name: 'provider_order_id', nullable: true })
  providerOrderId: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 8, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 64 })
  status: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  method: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  bank: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  wallet: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  upi: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  fee: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  tax: number | null;

  @Column({ type: 'timestamptz', name: 'captured_at', nullable: true })
  capturedAt: Date | null;

  @Column({ type: 'varchar', length: 128, name: 'invoice_id', nullable: true })
  invoiceId: string | null;

  @Column({ type: 'jsonb', name: 'raw_json', default: {} })
  rawJson: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
