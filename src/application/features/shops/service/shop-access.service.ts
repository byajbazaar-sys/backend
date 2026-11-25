import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { IIdentity } from '@shared-libs';
import { Request } from 'express';

import { IShopMembershipsRepository, SHOP_MEMBERSHIPS_REPOSITORY } from './i-shop-memberships.repository';
import { IUsersRepository, USERS_REPOSITORY } from '../../users/service/i-users.repository';
import {
  ROLE_PRESETS,
  ShopModule,
  ShopPermissions,
  ShopRole,
  accessRuleFor,
  allows,
  apiPath,
  effectivePermissions,
  isActorScoped,
} from '../domain';

/** The header the apps send with the shop the person is working in. */
export const SHOP_HEADER = 'x-shop-id';
/** Same, for links that can't send headers (images, downloads with ?users_token=). */
export const SHOP_QUERY = 'shop_id';

export const SHOP_ACCESS_DENIED = 'SHOP_ACCESS_DENIED';
export const SHOP_PERMISSION_DENIED = 'SHOP_PERMISSION_DENIED';

export interface ShopAccess {
  role: ShopRole;
  permissions: ShopPermissions;
  /** True for the owner (their own account, or an extra shop they created). */
  isOwner: boolean;
}

/** Access answers are cached briefly per (person, shop): every API call would otherwise hit the database. */
const CACHE_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turns the signed-in person into "who works on which shop": with `X-Shop-Id` the request acts on that shop (when
 * the person owns it or is an active member), and every feature then reads / writes that shop's data. Each request
 * is also checked against the person's access to the module it touches (reads need `view`, changes `edit`).
 */
@Injectable()
export class ShopAccessService {
  private readonly cache = new Map<string, { value: ShopAccess | null; until: number }>();

  constructor(
    @Inject(SHOP_MEMBERSHIPS_REPOSITORY) private readonly memberships: IShopMembershipsRepository,
    @Inject(USERS_REPOSITORY) private readonly users: IUsersRepository,
  ) {}

  /** The person's access to a shop, or null when they have none. */
  async accessFor(actorUserId: string, shopId: string): Promise<ShopAccess | null> {
    if (shopId === actorUserId) return { role: 'owner', permissions: ROLE_PRESETS.owner, isOwner: true };
    const key = `${actorUserId}:${shopId}`;
    const hit = this.cache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;

    let value: ShopAccess | null = null;
    const shop = await this.users.findById(shopId);
    if (shop?.ownerUserId === actorUserId) {
      value = { role: 'owner', permissions: ROLE_PRESETS.owner, isOwner: true };
    } else if (shop) {
      const membership = await this.memberships.find(shopId, actorUserId);
      if (membership?.status === 'active') {
        value = {
          role: membership.role,
          permissions: effectivePermissions(membership.role, membership.permissions),
          isOwner: false,
        };
      }
    }
    if (this.cache.size > 5_000) this.cache.clear();
    this.cache.set(key, { value, until: Date.now() + CACHE_MS });
    return value;
  }

  /** Drop cached answers after a member's role / access changed (this instance; others expire within 30 s). */
  forget(shopId: string, actorUserId?: string): void {
    for (const key of this.cache.keys()) {
      if (key.endsWith(`:${shopId}`) && (!actorUserId || key.startsWith(`${actorUserId}:`))) this.cache.delete(key);
    }
  }

  /** The identity a request runs with (see class doc). Throws 403 when the shop or the module is off limits. */
  async resolve(request: Request, identity: IIdentity): Promise<IIdentity> {
    const actorUserId = identity.actorUserId ?? identity.userId;
    const path = apiPath(request.originalUrl || request.url || '');
    const header = request.headers?.[SHOP_HEADER];
    // Links that carry the token in the URL (<img src>, downloads) name the shop there too.
    const fromQuery = (request.query as Record<string, unknown> | undefined)?.[SHOP_QUERY];
    const requested = (
      (Array.isArray(header) ? header[0] : header) ?? (typeof fromQuery === 'string' ? fromQuery : undefined)
    )?.trim();

    // Personal endpoints (login, shop list, invites, own plan …) always act as the person.
    if (isActorScoped(path) || !requested || requested === actorUserId) {
      return {
        ...identity,
        actorUserId,
        shopRole: 'owner',
        shopPermissions: ROLE_PRESETS.owner,
      };
    }
    if (!UUID.test(requested)) {
      throw new ForbiddenException({ code: SHOP_ACCESS_DENIED, message: 'Unknown shop.' });
    }
    const access = await this.accessFor(actorUserId, requested);
    if (!access) {
      throw new ForbiddenException({
        code: SHOP_ACCESS_DENIED,
        message: 'You no longer have access to this shop. Ask the owner to invite you again.',
      });
    }
    this.assertAllowed(access, path, request.method);
    return {
      ...identity,
      userId: requested,
      actorUserId,
      shopRole: access.role,
      shopPermissions: access.permissions,
    };
  }

  /**
   * Who hears about something in a shop: its owner (the person, also for an extra shop) and the active members
   * with at least `view` on `module`. Push devices and emails belong to people, never to the shop account.
   */
  async peopleFor(
    shopId: string,
    module: ShopModule,
  ): Promise<{ ownerUserId: string | null; memberUserIds: string[] }> {
    const shop = await this.users.findById(shopId);
    if (!shop) return { ownerUserId: null, memberUserIds: [] };
    const members = await this.memberships.listForShop(shopId);
    return {
      ownerUserId: shop.ownerUserId ?? shop.id,
      memberUserIds: members
        .filter((m) => m.status === 'active' && allows(effectivePermissions(m.role, m.permissions), module, 'view'))
        .map((m) => m.memberUserId),
    };
  }

  private assertAllowed(access: ShopAccess, path: string, method: string): void {
    const { permissions } = access;
    const rule = accessRuleFor(path, method);
    if (rule.kind === 'always') return;
    if (rule.kind === 'ownerOnly') {
      if (access.isOwner) return;
      throw new ForbiddenException({ code: SHOP_PERMISSION_DENIED, message: rule.reason });
    }
    if (rule.kind === 'denied') {
      throw new ForbiddenException({
        code: SHOP_PERMISSION_DENIED,
        message: 'This action is not available for shop members.',
      });
    }
    if (rule.kind === 'shared') {
      // Shared areas: anyone can read; changes need edit access to something.
      if (rule.need === 'view' || Object.values(permissions).some((level) => level === 'edit')) return;
      throw new ForbiddenException({
        code: SHOP_PERMISSION_DENIED,
        message: 'You have view-only access to this shop.',
      });
    }
    if (rule.kind === 'anyOf') {
      if (rule.modules.some((m) => allows(permissions, m, rule.need))) return;
      throw new ForbiddenException({
        code: SHOP_PERMISSION_DENIED,
        message: "You don't have permission to change this. Ask the shop owner.",
      });
    }
    if (allows(permissions, rule.module, rule.need)) return;
    throw new ForbiddenException({
      code: SHOP_PERMISSION_DENIED,
      module: rule.module,
      message:
        permissions[rule.module] === 'view'
          ? 'You have view-only access here. Ask the shop owner for edit access.'
          : "You don't have access to this part of the shop.",
    });
  }
}
