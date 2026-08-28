import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { EWhatsAppConnectionStatus } from '../../../application/features/whatsapp/enums';

@Entity('whatsapp_business_connections')
@Index('UQ_whatsapp_business_connections_user_id', ['userId'], { unique: true })
export class WhatsAppBusinessConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 64, name: 'waba_id' })
  wabaId: string;

  @Column({ type: 'varchar', length: 64, name: 'phone_number_id' })
  phoneNumberId: string;

  @Column({ type: 'varchar', length: 32, name: 'display_phone_number', nullable: true })
  displayPhoneNumber?: string;

  @Column({ type: 'varchar', length: 255, name: 'business_name', nullable: true })
  businessName?: string;

  @Column({ type: 'varchar', length: 32, name: 'connection_status', default: EWhatsAppConnectionStatus.Pending })
  connectionStatus: EWhatsAppConnectionStatus;

  @Column({ type: 'text', name: 'access_token_reference' })
  accessTokenReference: string;

  @Column({ type: 'boolean', name: 'due_reminders_enabled', default: false })
  dueRemindersEnabled: boolean;

  @Column({ type: 'varchar', length: 512, name: 'reengagement_template_name', nullable: true })
  reengagementTemplateName?: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
