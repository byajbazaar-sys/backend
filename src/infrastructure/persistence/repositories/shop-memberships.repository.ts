import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IShopMembershipsRepository, ShopMembership } from '../../../application';
import { ShopMembershipEntity } from '../entities';

const toDomain = (e: ShopMembershipEntity): ShopMembership => ({
  id: e.id,
  shopId: e.shopId,
  memberUserId: e.memberUserId,
  role: e.role as ShopMembership['role'],
  permissions: (e.permissions ?? {}) as ShopMembership['permissions'],
  status: e.status === 'disabled' ? 'disabled' : 'active',
  invitedBy: e.invitedBy,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

@Injectable()
export class ShopMembershipsRepository implements IShopMembershipsRepository {
  constructor(@InjectRepository(ShopMembershipEntity) private readonly repo: Repository<ShopMembershipEntity>) {}

  async find(shopId: string, memberUserId: string): Promise<ShopMembership | null> {
    const e = await this.repo.findOne({ where: { shopId, memberUserId } });
    return e ? toDomain(e) : null;
  }

  async findById(id: string): Promise<ShopMembership | null> {
    const e = await this.repo.findOne({ where: { id } });
    return e ? toDomain(e) : null;
  }

  async listForShop(shopId: string): Promise<ShopMembership[]> {
    return (await this.repo.find({ where: { shopId }, order: { createdAt: 'ASC' } })).map(toDomain);
  }

  async listForMember(memberUserId: string): Promise<ShopMembership[]> {
    return (await this.repo.find({ where: { memberUserId }, order: { createdAt: 'ASC' } })).map(toDomain);
  }

  async upsert(membership: Omit<ShopMembership, 'id'>): Promise<ShopMembership> {
    const existing = await this.repo.findOne({
      where: { shopId: membership.shopId, memberUserId: membership.memberUserId },
    });
    const saved = await this.repo.save(
      this.repo.create({
        ...(existing ?? {}),
        shopId: membership.shopId,
        memberUserId: membership.memberUserId,
        role: membership.role,
        permissions: membership.permissions as Record<string, string>,
        status: membership.status,
        invitedBy: membership.invitedBy ?? existing?.invitedBy ?? null,
      }),
    );
    return toDomain(saved);
  }

  async update(
    id: string,
    patch: Partial<Pick<ShopMembership, 'role' | 'permissions' | 'status'>>,
  ): Promise<ShopMembership> {
    await this.repo.update({ id }, patch as Partial<ShopMembershipEntity>);
    return toDomain(await this.repo.findOneOrFail({ where: { id } }));
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
