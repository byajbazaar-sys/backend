import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('try_on_assets')
@Index('IDX_try_on_assets_created_by_type_created_at', ['createdBy', 'type', 'createdAt'])
export class TryOnAssetEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 20 })
  type: string;

  @Column({ type: 'varchar', length: 512 })
  imageKey: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label?: string | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  heightInInches?: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  color?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
