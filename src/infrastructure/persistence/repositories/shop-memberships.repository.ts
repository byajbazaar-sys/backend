import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IShopMembershipsRepository, ShopMembership } from '../../../application';
import { ShopMembershipEntity } from '../entities';

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

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

  /**
   * Creates or re-activates. Two accepts for the same person and shop can race (double tap, two tabs): the unique
   * (shop_id, member_user_id) index makes the second insert fail, so it is retried once as an update.
   */
  async upsert(membership: Omit<ShopMembership, 'id'>): Promise<ShopMembership> {
    try {
      return await this.save(membership);
    } catch (err) {
      const e = err as { code?: string; driverError?: { code?: string } };
      if ((e?.code ?? e?.driverError?.code) !== UNIQUE_VIOLATION) throw err;
      return this.save(membership);
    }
  }

  private async save(membership: Omit<ShopMembership, 'id'>): Promise<ShopMembership> {
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

  async deleteForMember(memberUserId: string): Promise<void> {
    await this.repo.delete({ memberUserId });
  }
}
