import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { UserEntity } from './user.entity';

@Entity('label_designer_settings')
export class LabelDesignerSettingsEntity {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId: string;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'int', default: 1, name: 'schema_version' })
  schemaVersion: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  templates: Record<string, unknown>[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb", name: 'printer_profiles' })
  printerProfiles: Record<string, unknown>[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
