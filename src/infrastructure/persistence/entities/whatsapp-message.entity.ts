import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { EWhatsAppMessageDeliveryStatus } from '../../../application/features/whatsapp/enums';

@Entity('whatsapp_messages')
@Index('UQ_whatsapp_messages_meta_message_id', ['metaMessageId'], { unique: true })
@Index('IDX_whatsapp_messages_user_id_meta_message_id', ['userId', 'metaMessageId'])
@Index('IDX_whatsapp_messages_waba_phone', ['wabaId', 'phoneNumberId'])
export class WhatsAppMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 64, name: 'waba_id' })
  wabaId: string;

  @Column({ type: 'varchar', length: 64, name: 'phone_number_id' })
  phoneNumberId: string;

  @Column({ type: 'varchar', length: 255, name: 'meta_message_id' })
  metaMessageId: string;

  @Column({ type: 'varchar', length: 32, name: 'recipient' })
  recipient: string;

  @Column({ type: 'varchar', length: 16, name: 'delivery_status', default: EWhatsAppMessageDeliveryStatus.Sent })
  deliveryStatus: EWhatsAppMessageDeliveryStatus;

  @Column({ type: 'varchar', length: 32, name: 'status_timestamp', nullable: true })
  statusTimestamp?: string;

  @Column({ type: 'int', name: 'error_code', nullable: true })
  errorCode?: number;

  @Column({ type: 'varchar', length: 255, name: 'error_title', nullable: true })
  errorTitle?: string;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage?: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
