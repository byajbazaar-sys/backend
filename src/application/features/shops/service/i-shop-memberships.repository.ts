import { ShopMembership } from '../domain';

export const SHOP_MEMBERSHIPS_REPOSITORY = 'SHOP_MEMBERSHIPS_REPOSITORY';

export interface IShopMembershipsRepository {
  find(shopId: string, memberUserId: string): Promise<ShopMembership | null>;
  findById(id: string): Promise<ShopMembership | null>;
  listForShop(shopId: string): Promise<ShopMembership[]>;
  listForMember(memberUserId: string): Promise<ShopMembership[]>;
  /** Creates or re-activates (an earlier, removed member invited again). */
  upsert(membership: Omit<ShopMembership, 'id'>): Promise<ShopMembership>;
  update(id: string, patch: Partial<Pick<ShopMembership, 'role' | 'permissions' | 'status'>>): Promise<ShopMembership>;
  delete(id: string): Promise<void>;
  /** Every shop the person was a member of (their account was deleted). */
  deleteForMember(memberUserId: string): Promise<void>;
}
