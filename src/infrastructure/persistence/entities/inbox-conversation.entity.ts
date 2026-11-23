import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('inbox_conversations')
@Index('UQ_inbox_conversations_customer', ['userId', 'channel', 'externalUserId'], { unique: true })
@Index('IDX_inbox_conversations_user_last', ['userId', 'lastMessageAt'])
export class InboxConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 20, name: 'channel' })
  channel: string;

  @Column({ type: 'varchar', length: 64, name: 'external_user_id' })
  externalUserId: string;

  @Column({ type: 'varchar', length: 255, name: 'customer_name', nullable: true })
  customerName: string | null;

  @Column({ type: 'uuid', name: 'customer_id', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar', length: 20, name: 'state', default: 'auto' })
  state: string;

  @Column({ type: 'integer', name: 'unread_count', default: 0 })
  unreadCount: number;

  @Column({ type: 'timestamptz', name: 'last_message_at', nullable: true })
  lastMessageAt: Date | null;

  @Column({ type: 'timestamptz', name: 'last_inbound_at', nullable: true })
  lastInboundAt: Date | null;

  @Column({ type: 'varchar', length: 300, name: 'last_message_preview', nullable: true })
  lastMessagePreview: string | null;

  @Column({ type: 'timestamptz', name: 'needs_reply_since', nullable: true })
  needsReplySince: Date | null;

  @Column({ type: 'varchar', length: 200, name: 'handoff_reason', nullable: true })
  handoffReason: string | null;

  @Column({ type: 'timestamptz', name: 'last_owner_reply_at', nullable: true })
  lastOwnerReplyAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
