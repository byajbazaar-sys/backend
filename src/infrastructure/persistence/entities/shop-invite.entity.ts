import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('shop_invites')
export class ShopInviteEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) shopId: string;
  @Column({ type: 'varchar', length: 255 }) email: string;
  @Column({ type: 'varchar', length: 20 }) role: string;
  @Column({ type: 'jsonb', default: {} }) permissions: Record<string, string>;
  @Column({ type: 'varchar', length: 64 }) tokenHash: string;
  @Column({ type: 'uuid' }) invitedBy: string;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) acceptedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) acceptedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) revokedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
