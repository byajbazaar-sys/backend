import { ShopInvite } from '../domain';

export const SHOP_INVITES_REPOSITORY = 'SHOP_INVITES_REPOSITORY';

export interface IShopInvitesRepository {
  create(invite: Omit<ShopInvite, 'id'>): Promise<ShopInvite>;
  findById(id: string): Promise<ShopInvite | null>;
  findByTokenHash(tokenHash: string): Promise<ShopInvite | null>;
  /** Not accepted, not revoked (expired ones included — the list shows them as expired). */
  listOpenForShop(shopId: string): Promise<ShopInvite[]>;
  update(id: string, patch: Partial<ShopInvite>): Promise<ShopInvite>;
}
