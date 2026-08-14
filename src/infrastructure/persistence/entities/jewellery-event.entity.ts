import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

import { EJewelleryEventStatus } from '../../../application/features/events/domain/enums';

@Entity('jewellery_events')
export class JewelleryEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 512 })
  name!: string;

  @Index('UQ_jewellery_events_slug', { unique: true })
  @Column({ type: 'varchar', length: 512 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Index('IDX_jewellery_events_start_date')
  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate!: Date;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate!: Date;

  @Index('IDX_jewellery_events_city')
  @Column({ type: 'varchar', length: 128, nullable: true })
  city!: string;

  @Index('IDX_jewellery_events_state')
  @Column({ type: 'varchar', length: 128, nullable: true })
  state!: string;

  @Column({ type: 'varchar', length: 128, nullable: true, default: 'India' })
  country!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  venue!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  organizer!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  category!: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  website!: string;

  @Column({ type: 'varchar', length: 1024, name: 'registration_url', nullable: true })
  registrationUrl!: string;

  @Column({ type: 'varchar', length: 1024, name: 'source_url', nullable: true })
  sourceUrl!: string;

  @Column({ type: 'varchar', length: 256, name: 'visitor_entry_fee', nullable: true })
  visitorEntryFee!: string;

  @Column({ type: 'varchar', length: 256, name: 'stall_fee', nullable: true })
  stallFee!: string;

  @Column({ type: 'varchar', length: 256, name: 'contact_email', nullable: true })
  contactEmail!: string;

  @Column({ type: 'varchar', length: 64, name: 'contact_phone', nullable: true })
  contactPhone!: string;

  @Column({ type: 'jsonb', default: [] })
  tags!: string[];

  @Index('IDX_jewellery_events_status')
  @Column({
    type: 'enum',
    enum: EJewelleryEventStatus,
    enumName: 'e_jewellery_event_status_enum',
    default: EJewelleryEventStatus.ACTIVE,
  })
  status!: EJewelleryEventStatus;

  @Column({ type: 'boolean', name: 'is_featured', default: false })
  isFeatured!: boolean;

  @Column({ type: 'varchar', length: 512, name: 'seo_title', nullable: true })
  seoTitle!: string;

  @Column({ type: 'text', name: 'seo_description', nullable: true })
  seoDescription!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
