import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { EPosSessionStatus } from '../../../application';

@Entity('pos_sessions')
@Index('IDX_pos_sessions_session_code', ['sessionCode'], { unique: true })
@Index('IDX_pos_sessions_created_by', ['createdBy'])
@Index('IDX_pos_sessions_status', ['status'])
export class PosSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 32, unique: true })
  sessionCode: string;

  @Column({
    type: 'enum',
    enum: EPosSessionStatus,
    enumName: 'e_pos_session_status_enum',
    default: EPosSessionStatus.Created,
  })
  status: EPosSessionStatus;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'varchar', length: 128, nullable: true })
  desktopConnectionId: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  mobileConnectionId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
