/** X-Shop-Id → which shop a request works on, and whether the person may do it there. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ShopMembership } from '../../src/application/features/shops/domain';
import { ShopAccessService } from '../../src/application/features/shops/service/shop-access.service';
import { pickUserUpdate } from '../../src/application/features/users/utils/pick-user-update.util';

const OWNER = '11111111-1111-4111-8111-111111111111';
const EXTRA = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';
const STRANGER = '44444444-4444-4444-8444-444444444444';

function service(memberships: Partial<ShopMembership>[]) {
  const users: Record<string, { id: string; ownerUserId?: string }> = {
    [OWNER]: { id: OWNER },
    [EXTRA]: { id: EXTRA, ownerUserId: OWNER },
    [MEMBER]: { id: MEMBER },
  };
  const repo = {
    find: async (shopId: string, memberUserId: string) =>
      (memberships.find((m) => m.shopId === shopId && m.memberUserId === memberUserId) as ShopMembership) ?? null,
    listForShop: async (shopId: string) => memberships.filter((m) => m.shopId === shopId) as ShopMembership[],
  };
  return new ShopAccessService(repo as never, { findById: async (id: string) => users[id] ?? null } as never);
}

const req = (method: string, url: string, shop?: string) =>
  ({ method, originalUrl: url, headers: shop ? { 'x-shop-id': shop } : {}, query: {} }) as never;
const person = (id: string) => ({ userId: id, actorUserId: id, userType: 'user' }) as never;

const staff: Omit<ShopMembership, 'id'> = {
  shopId: OWNER,
  memberUserId: MEMBER,
  role: 'staff',
  permissions: {},
  status: 'active',
};

describe('ShopAccessService.resolve', () => {
  it('works in the person’s own shop without a header', async () => {
    const id = await service([]).resolve(req('GET', '/api/v1/customers'), person(MEMBER));
    assert.equal(id.userId, MEMBER);
    assert.equal(id.shopRole, 'owner');
  });

  it('switches a member into the shop they were invited to', async () => {
    const id = await service([staff]).resolve(req('GET', '/api/v1/customers', OWNER), person(MEMBER));
    assert.equal(id.userId, OWNER);
    assert.equal(id.actorUserId, MEMBER);
    assert.equal(id.shopRole, 'staff');
  });

  it('lets the owner into the extra shops they added', async () => {
    const id = await service([]).resolve(req('DELETE', '/api/v1/users/x', EXTRA), person(OWNER));
    assert.equal(id.userId, EXTRA);
    assert.equal(id.shopRole, 'owner');
  });

  it('refuses strangers, disabled members and malformed shop ids', async () => {
    const svc = service([{ ...staff, status: 'disabled' }]);
    await assert.rejects(svc.resolve(req('GET', '/api/v1/customers', OWNER), person(MEMBER)), /no longer have access/);
    await assert.rejects(
      svc.resolve(req('GET', '/api/v1/customers', OWNER), person(STRANGER)),
      /no longer have access/,
    );
    await assert.rejects(svc.resolve(req('GET', '/api/v1/customers', 'not-a-uuid'), person(MEMBER)), /Unknown shop/);
  });

  it('does not give a member of the main shop access to the owner’s extra shops', async () => {
    await assert.rejects(service([staff]).resolve(req('GET', '/api/v1/customers', EXTRA), person(MEMBER)));
  });

  it('checks the member’s module access', async () => {
    const svc = service([{ ...staff, role: 'viewer' }]);
    await svc.resolve(req('GET', '/api/v1/customers', OWNER), person(MEMBER));
    await assert.rejects(svc.resolve(req('POST', '/api/v1/customers', OWNER), person(MEMBER)), /view-only/);
  });

  it('keeps owner-only actions from every member, superusers included', async () => {
    const svc = service([{ ...staff, role: 'manager' }]);
    await assert.rejects(svc.resolve(req('DELETE', '/api/v1/users/x', OWNER), person(MEMBER)), /Only the shop owner/);
    await assert.rejects(svc.resolve(req('POST', '/api/v1/settings/api/generate', OWNER), person(MEMBER)), /API keys/);
    // …but they can see the settings and edit the shop profile.
    await svc.resolve(req('GET', '/api/v1/settings/api', OWNER), person(MEMBER));
    await svc.resolve(req('PATCH', `/api/v1/users/${OWNER}`, OWNER), person(MEMBER));
  });

  it('acts as the person on personal routes even with a shop selected', async () => {
    const id = await service([staff]).resolve(req('GET', '/api/v1/shops', OWNER), person(MEMBER));
    assert.equal(id.userId, MEMBER);
  });

  it('reads the plan status of the selected shop (the owner’s plan)', async () => {
    const id = await service([staff]).resolve(
      req('GET', '/api/v1/payments/subscription/status', OWNER),
      person(MEMBER),
    );
    assert.equal(id.userId, OWNER);
  });

  it('forgets cached access after a change', async () => {
    const memberships = [{ ...staff }];
    const svc = service(memberships);
    await svc.resolve(req('GET', '/api/v1/customers', OWNER), person(MEMBER));
    memberships[0].status = 'disabled';
    svc.forget(OWNER, MEMBER);
    await assert.rejects(svc.resolve(req('GET', '/api/v1/customers', OWNER), person(MEMBER)));
  });
});

describe('ShopAccessService.peopleFor', () => {
  it('names the owner (also for extra shops) and the active members who handle the area', async () => {
    const svc = service([
      { ...staff, shopId: EXTRA },
      { ...staff, shopId: EXTRA, memberUserId: 'viewer', role: 'viewer' },
      { ...staff, shopId: EXTRA, memberUserId: 'off', status: 'disabled' },
      { ...staff, shopId: EXTRA, memberUserId: 'nowa', role: 'custom', permissions: { whatsapp: 'none' } },
    ]);
    assert.deepEqual(await svc.peopleFor(EXTRA, 'whatsapp'), { ownerUserId: OWNER, memberUserIds: [MEMBER, 'viewer'] });
    assert.deepEqual(await svc.peopleFor('missing', 'whatsapp'), { ownerUserId: null, memberUserIds: [] });
  });
});

describe('pickUserUpdate (PATCH /users/:id)', () => {
  const attack = {
    businessName: 'Shop',
    firstName: 'New',
    userType: 'admin',
    googleId: 'attacker-google-id',
    resetPasswordToken: 'known',
    resetPasswordExpires: new Date(),
    password: 'x',
    isEmailVerified: true,
    isPhoneVerified: true,
    phoneVerificationRequired: false,
    trialEndsAt: new Date(2100, 0, 1),
    ownerUserId: null,
    catalogSlug: 'taken',
    email: 'x@y.z',
  };

  it('never passes login / security state through', () => {
    const out = pickUserUpdate(attack, { isAdmin: false, isAccountOwner: true });
    assert.deepEqual(out, { businessName: 'Shop', firstName: 'New' });
  });

  it('leaves the owner’s personal details alone when a member saves the shop settings', () => {
    const out = pickUserUpdate(
      { ...attack, lastName: 'X', phoneNumber: '+91' },
      { isAdmin: false, isAccountOwner: false },
    );
    assert.deepEqual(out, { businessName: 'Shop' });
  });

  it('lets platform admins change the user type', () => {
    assert.equal(pickUserUpdate(attack, { isAdmin: true, isAccountOwner: false }).userType, 'admin');
  });

  it('keeps every shop field the apps send', () => {
    const body = {
      businessName: 'a',
      address: 'b',
      gstin: 'c',
      pan: 'd',
      state: 'e',
      stateCode: 'f',
      proprietorName: 'g',
      alternatePhoneNumber: 'h',
      bankName: 'i',
      bankBranch: 'j',
      bankAccountNumber: 'k',
      bankIfsc: 'l',
      showBankDetailsOnBill: false,
      tryOnBackgroundColor: '#000',
    };
    assert.deepEqual(pickUserUpdate(body, { isAdmin: false, isAccountOwner: false }), body);
  });
});
