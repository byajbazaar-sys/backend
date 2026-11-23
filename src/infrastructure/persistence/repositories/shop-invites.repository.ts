import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { IShopInvitesRepository, ShopInvite } from '../../../application';
import { ShopInviteEntity } from '../entities';

const toDomain = (e: ShopInviteEntity): ShopInvite => ({
  id: e.id,
  shopId: e.shopId,
  email: e.email,
  role: e.role as ShopInvite['role'],
  permissions: (e.permissions ?? {}) as ShopInvite['permissions'],
  tokenHash: e.tokenHash,
  invitedBy: e.invitedBy,
  expiresAt: e.expiresAt,
  acceptedAt: e.acceptedAt,
  acceptedBy: e.acceptedBy,
  revokedAt: e.revokedAt,
  createdAt: e.createdAt,
});

@Injectable()
export class ShopInvitesRepository implements IShopInvitesRepository {
  constructor(@InjectRepository(ShopInviteEntity) private readonly repo: Repository<ShopInviteEntity>) {}

  async create(invite: Omit<ShopInvite, 'id'>): Promise<ShopInvite> {
    const saved = await this.repo.save(
      this.repo.create({ ...invite, permissions: invite.permissions as Record<string, string> }),
    );
    return toDomain(saved);
  }

  async findById(id: string): Promise<ShopInvite | null> {
    const e = await this.repo.findOne({ where: { id } });
    return e ? toDomain(e) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<ShopInvite | null> {
    const e = await this.repo.findOne({ where: { tokenHash } });
    return e ? toDomain(e) : null;
  }

  async listOpenForShop(shopId: string): Promise<ShopInvite[]> {
    return (
      await this.repo.find({
        where: { shopId, acceptedAt: IsNull(), revokedAt: IsNull() },
        order: { createdAt: 'DESC' },
      })
    ).map(toDomain);
  }

  async update(id: string, patch: Partial<ShopInvite>): Promise<ShopInvite> {
    await this.repo.update({ id }, patch as Partial<ShopInviteEntity>);
    return toDomain(await this.repo.findOneOrFail({ where: { id } }));
  }
}
