import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('inbox_settings')
export class InboxSettingsEntity {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'boolean', name: 'whatsapp_enabled', default: false })
  whatsappEnabled: boolean;

  @Column({ type: 'boolean', name: 'instagram_enabled', default: false })
  instagramEnabled: boolean;

  @Column({ type: 'boolean', name: 'answer_shop_info', default: true })
  answerShopInfo: boolean;

  @Column({ type: 'boolean', name: 'answer_rates', default: true })
  answerRates: boolean;

  @Column({ type: 'boolean', name: 'answer_catalogue', default: true })
  answerCatalogue: boolean;

  @Column({ type: 'boolean', name: 'answer_account', default: true })
  answerAccount: boolean;

  @Column({ type: 'varchar', length: 300, name: 'business_hours', nullable: true })
  businessHours: string | null;

  @Column({ type: 'text', name: 'about', nullable: true })
  about: string | null;

  @Column({ type: 'jsonb', name: 'faqs', default: () => "'[]'::jsonb" })
  faqs: { question: string; answer: string }[];

  @Column({ type: 'text', name: 'instructions', nullable: true })
  instructions: string | null;

  @Column({ type: 'varchar', length: 500, name: 'handoff_message', nullable: true })
  handoffMessage: string | null;

  @Column({ type: 'boolean', name: 'notify_email', default: true })
  notifyEmail: boolean;

  @Column({ type: 'boolean', name: 'notify_push', default: true })
  notifyPush: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
