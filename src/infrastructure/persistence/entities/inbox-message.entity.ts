import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('inbox_messages')
@Index('IDX_inbox_messages_conversation_created', ['conversationId', 'createdAt'])
export class InboxMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'conversation_id' })
  conversationId: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 20, name: 'author' })
  author: string;

  @Column({ type: 'text', name: 'text' })
  text: string;

  /** Unique per channel message (partial index in the migration: owner / bot replies may have none). */
  @Column({ type: 'varchar', length: 255, name: 'external_message_id', nullable: true })
  externalMessageId: string | null;

  @Column({ type: 'varchar', length: 20, name: 'status' })
  status: string;

  @Column({ type: 'text', name: 'error', nullable: true })
  error: string | null;

  @Column({ type: 'timestamptz', name: 'bot_handled_at', nullable: true })
  botHandledAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
