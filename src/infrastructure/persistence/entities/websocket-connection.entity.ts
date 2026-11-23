import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

import { EDeviceType } from '../../../application';

@Entity('websocket_connections')
@Index('IDX_websocket_connections_connection_id', ['connectionId'], { unique: true })
@Index('IDX_websocket_connections_session_id', ['sessionId'])
@Index('IDX_websocket_connections_user_id', ['userId'])
export class WebSocketConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  connectionId: string;

  @Column({ type: 'uuid', nullable: true })
  sessionId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: EDeviceType, enumName: 'e_device_type_enum' })
  deviceType: EDeviceType;

  /** The signed-in person; userId is the shop this connection receives events for. */
  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  /** Invited members: their access when connecting (events of areas they can't see are not sent). */
  @Column({ type: 'jsonb', nullable: true })
  shopPermissions: Record<string, string> | null;

  @CreateDateColumn()
  connectedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  disconnectedAt: Date;
}
