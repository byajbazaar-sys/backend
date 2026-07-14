import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('payment_events')
@Index('UQ_payment_events_provider_event_id', ['provider', 'eventId'], { unique: true })
export class PaymentEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, default: 'razorpay' })
  provider: string;

  @Column({ type: 'varchar', length: 128, name: 'event_id' })
  eventId: string;

  @Column({ type: 'varchar', length: 128, name: 'event_name' })
  eventName: string;

  @Column({ type: 'boolean', default: false })
  processed: boolean;

  @Column({ type: 'text', nullable: true })
  signature: string | null;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ type: 'uuid', name: 'payment_id', nullable: true })
  paymentId: string | null;

  @Column({ type: 'uuid', name: 'payment_order_id', nullable: true })
  paymentOrderId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
