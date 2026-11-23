import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('shop_memberships')
@Index('UQ_shop_memberships_shop_member', ['shopId', 'memberUserId'], { unique: true })
export class ShopMembershipEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) shopId: string;
  @Column({ type: 'uuid' }) memberUserId: string;
  @Column({ type: 'varchar', length: 20 }) role: string;
  @Column({ type: 'jsonb', default: {} }) permissions: Record<string, string>;
  @Column({ type: 'varchar', length: 20, default: 'active' }) status: string;
  @Column({ type: 'uuid', nullable: true }) invitedBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
