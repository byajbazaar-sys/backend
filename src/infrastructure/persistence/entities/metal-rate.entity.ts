import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserEntity } from './user.entity';
import { EMetalType } from '../../../application/features/inventory/enums';

@Entity('metal_rates')
export class MetalRateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @Column({ type: 'enum', enum: EMetalType, enumName: 'e_metal_type_enum' })
  metalType: EMetalType;

  @Column({ type: 'varchar', length: 10 })
  purity: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  rate: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
