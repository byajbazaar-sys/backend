import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('whatsapp_conversation_windows')
@Index('UQ_whatsapp_conversation_windows_scope', ['userId', 'wabaId', 'phoneNumberId', 'recipient'], {
  unique: true,
})
export class WhatsAppConversationWindowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 64, name: 'waba_id' })
  wabaId: string;

  @Column({ type: 'varchar', length: 64, name: 'phone_number_id' })
  phoneNumberId: string;

  @Column({ type: 'varchar', length: 32, name: 'recipient' })
  recipient: string;

  @Column({ type: 'timestamptz', name: 'last_inbound_at' })
  lastInboundAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
